import base64
import io
import json
import logging
import os
import time

import httpx

from app.core.ai import AI_API_KEY, AI_API_BASE, PROVIDERS, ACTIVE_PROVIDER

logger = logging.getLogger(__name__)

TASK_MODELS = {
    "ocr_vision": "glm-4v-flash",
    "ocr_extract": "glm-4v-flash",
    "reasoning": "glm-5.1",
    "chat": "glm-5.1",
    "code": "glm-5.1",
    "default": "glm-5.1",
    # 任务隧道 — 辅助LLM调用走本地模型，省token + 保隐私
    "quality_gate": "gemma4:26b",
    "memory_extract": "gemma4:26b",
    "error_recovery": "gemma4:26b",
    # DeepSeek — 深度推理任务（进化、评估、反思）
    "evolution_generate": "deepseek-chat",
    "evolution_eval": "deepseek-chat",
    "reflexion": "deepseek-reasoner",
    "dataset_build": "deepseek-chat",
}

# 任务隧道：哪些任务路由到本地provider
TUNNEL_TASKS = {"quality_gate", "memory_extract", "error_recovery"}


def get_model_for_task(task: str) -> str:
    return TASK_MODELS.get(task, TASK_MODELS["default"])


async def sync_models_from_db(db):
    from sqlalchemy import select
    from app.models.system.models import SystemConfigKV

    result = await db.execute(
        select(SystemConfigKV).where(SystemConfigKV.key.in_([
            "ai_vision_model", "ai_reasoning_model", "ai_api_key", "ai_api_base",
            "ai_provider",
        ]))
    )
    rows = {r.key: r.value for r in result.scalars().all()}

    if rows.get("ai_provider"):
        await ai_gateway.switch_provider(rows["ai_provider"])

    if rows.get("ai_api_key"):
        ai_gateway.provider.api_key = rows["ai_api_key"]
        if ai_gateway.provider._client and not ai_gateway.provider._client.is_closed:
            await ai_gateway.provider._client.aclose()
            ai_gateway.provider._client = None

    if rows.get("ai_api_base"):
        ai_gateway.provider.base_url = rows["ai_api_base"]

    if rows.get("ai_vision_model"):
        TASK_MODELS["ocr_vision"] = rows["ai_vision_model"]
        TASK_MODELS["ocr_extract"] = rows["ai_vision_model"]

    if rows.get("ai_reasoning_model"):
        TASK_MODELS["reasoning"] = rows["ai_reasoning_model"]
        TASK_MODELS["chat"] = rows["ai_reasoning_model"]

    logger.info(f"AI config loaded from DB: provider={ai_gateway.provider_id} models={TASK_MODELS}")


class OpenAICompatibleProvider:
    """Generic provider that works with any OpenAI-compatible /chat/completions API.

    Supported providers:
    - Zhipu AI (智谱): open.bigmodel.cn
    - OpenAI: api.openai.com
    - Kimi (Moonshot): api.moonshot.cn
    - NVIDIA NIM: integrate.api.nvidia.com
    """

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or AI_API_KEY
        self.base_url = base_url or AI_API_BASE
        self._client: httpx.AsyncClient | None = None
        self._token_usage = {"total_tokens": 0, "request_count": 0}

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=120.0,
            )
        return self._client

    async def _request(self, payload: dict, endpoint: str = "chat/completions", _retry=0) -> dict:
        try:
            resp = await self.client.post(endpoint, json=payload)
            resp.raise_for_status()
            data = resp.json()
            usage = data.get("usage", {})
            self._token_usage["total_tokens"] += usage.get("total_tokens", 0)
            self._token_usage["request_count"] += 1
            return data
        except httpx.HTTPStatusError as e:
            body = e.response.text[:500] if e.response else ""
            logger.warning(f"API error {e.response.status_code}: {body}")
            if e.response.status_code >= 500 and _retry < 2:
                import asyncio
                await asyncio.sleep(2 * (_retry + 1))
                return await self._request(payload, endpoint, _retry + 1)
            raise RuntimeError(f"AI服务调用失败({e.response.status_code}): {body}")

    def _extract_content(self, data: dict) -> str:
        msg = data["choices"][0]["message"]
        content = msg.get("content")
        if content:
            return content
        reasoning = msg.get("reasoning_content") or msg.get("reasoning")
        return reasoning or ""

    async def chat(self, messages: list[dict], model: str = None, **kwargs) -> str:
        model = model or get_model_for_task("chat")
        payload = {"model": model, "messages": messages, **kwargs}
        if "flash" not in model and "mini" not in model:
            payload.update({"temperature": 0.3, "max_tokens": 4096})
        data = await self._request(payload)
        return self._extract_content(data)

    async def stream_chat(self, messages: list[dict], model: str = None, **kwargs):
        """Stream chat completions using SSE."""
        model = model or get_model_for_task("chat")
        payload = {"model": model, "messages": messages, "stream": True, **kwargs}
        if "flash" not in model and "mini" not in model:
            payload.update({"temperature": 0.3, "max_tokens": 4096})

        async with self.client.stream("POST", "chat/completions", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue

    async def vision(self, image_base64: str, prompt: str, model: str = None, **kwargs) -> str:
        model = model or get_model_for_task("ocr_vision")
        image_b64, mime_type = self._prepare_image(image_base64)
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}},
                ],
            }
        ]
        payload = {"model": model, "messages": messages, **kwargs}
        if "flash" not in model and "mini" not in model:
            payload.update({"temperature": 0.2, "max_tokens": 4096})
        data = await self._request(payload)
        result = self._extract_content(data)
        logger.info(f"[vision] model={model} mime={mime_type} response_len={len(result)} preview={result[:300]}")
        return result

    def _prepare_image(self, b64: str) -> tuple[str, str]:
        try:
            raw = base64.b64decode(b64)
        except Exception:
            return b64, "image/jpeg"
        if raw[:4] == b'\x89PNG':
            try:
                from PIL import Image
                img = Image.open(io.BytesIO(raw))
                if max(img.size) > 8192:
                    img.thumbnail((8192, 8192), Image.LANCZOS)
                    buf = io.BytesIO()
                    img.save(buf, format='PNG')
                    return base64.b64encode(buf.getvalue()).decode(), "image/png"
            except Exception:
                pass
            return b64, "image/png"
        elif raw[:2] == b'\xff\xd8':
            try:
                from PIL import Image
                img = Image.open(io.BytesIO(raw))
                if max(img.size) > 8192:
                    img.thumbnail((8192, 8192), Image.LANCZOS)
                    buf = io.BytesIO()
                    img.convert('RGB').save(buf, format='JPEG', quality=95)
                    return base64.b64encode(buf.getvalue()).decode(), "image/jpeg"
            except Exception:
                pass
            return b64, "image/jpeg"
        elif raw[:4] == b'%PDF':
            try:
                import fitz
                from PIL import Image
                doc = fitz.open(stream=raw, filetype="pdf")
                if len(doc) > 0:
                    max_pages = min(len(doc), 8)
                    page_images = []
                    for i in range(max_pages):
                        page = doc.load_page(i)
                        pix = page.get_pixmap(dpi=200)
                        page_images.append(Image.frombytes("RGB", [pix.width, pix.height], pix.samples))
                    if len(page_images) == 1:
                        buf = io.BytesIO()
                        page_images[0].save(buf, format='PNG')
                        return base64.b64encode(buf.getvalue()).decode(), "image/png"
                    total_h = sum(img.height for img in page_images)
                    max_w = max(img.width for img in page_images)
                    stitched = Image.new('RGB', (max_w, total_h), (255, 255, 255))
                    y = 0
                    for img in page_images:
                        stitched.paste(img, (0, y))
                        y += img.height
                    if max(stitched.size) > 16384:
                        stitched.thumbnail((16384, 16384), Image.LANCZOS)
                    buf = io.BytesIO()
                    stitched.save(buf, format='PNG')
                    return base64.b64encode(buf.getvalue()).decode(), "image/png"
            except Exception as e:
                logger.warning(f"PDF转图片失败: {e}")
            return b64, "image/jpeg"
        return b64, "image/jpeg"

    async def extract_text(self, image_base64: str, model: str = None) -> str:
        model = model or get_model_for_task("ocr_extract")
        prompt = "请识别并提取图片中的所有文字内容，按原始格式返回纯文本。"
        return await self.vision(image_base64, prompt, model=model)

    async def test_connection(self, model: str | None = None) -> dict:
        """Test API connectivity with a minimal request."""
        model = model or get_model_for_task("chat")
        try:
            resp = await self.chat(
                [{"role": "user", "content": "你好，请简短回复确认连接正常。"}],
                model=model,
            )
            return {"success": True, "model": model, "reply": resp[:200]}
        except Exception as e:
            return {"success": False, "model": model, "error": str(e)}

    def get_usage(self) -> dict:
        return {**self._token_usage}

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()


class AIGateway:
    def __init__(self):
        self.provider_id: str = ACTIVE_PROVIDER
        self.provider: OpenAICompatibleProvider = OpenAICompatibleProvider()
        self._local_provider: OpenAICompatibleProvider | None = None
        self._deepseek_provider: OpenAICompatibleProvider | None = None
        self._status = {"initialized_at": time.time()}

    @property
    def local_provider(self) -> OpenAICompatibleProvider:
        """本地Ollama provider（懒初始化）"""
        if self._local_provider is None:
            local_config = PROVIDERS.get("local")
            if local_config:
                self._local_provider = OpenAICompatibleProvider(
                    api_key="ollama",  # Ollama不需要真实key，但不能为空
                    base_url=local_config["base_url"],
                )
        return self._local_provider

    async def tunnel_chat(
        self, messages: list[dict], task: str = "quality_gate", **kwargs,
    ) -> str:
        """任务隧道 — 优先走本地模型，失败自动fallback到云端

        用于：quality_gate、memory_extract、error_recovery等辅助任务。
        这些任务对模型能力要求不高，但涉及业务隐私数据。
        """
        local_model = TASK_MODELS.get(task)
        if local_model and task in TUNNEL_TASKS:
            try:
                result = await self.local_provider.chat(messages, model=local_model, **kwargs)
                if result and len(result.strip()) > 5:
                    return result
            except Exception as e:
                logger.warning(f"本地模型调用失败({task})，回退云端: {e}")

        # fallback到云端
        cloud_model = "glm-4-flash"  # 辅助任务用flash即可
        return await self.provider.chat(messages, model=cloud_model, **kwargs)

    # DeepSeek provider（懒初始化）

    @property
    def deepseek_provider(self) -> OpenAICompatibleProvider | None:
        config = PROVIDERS.get("deepseek")
        key = os.getenv(config["api_key_env"]) if config else None
        if not config or not key:
            return None
        if self._deepseek_provider is None:
            self._deepseek_provider = OpenAICompatibleProvider(
                api_key=key,
                base_url=config["base_url"],
            )
        return self._deepseek_provider

    async def routed_chat(
        self, messages: list[dict], task: str = "chat", **kwargs,
    ) -> str:
        """智能路由：根据任务类型自动选择provider和model

        路由策略：
        - quality_gate/memory_extract/error_recovery → 本地Gemma（隐私+省钱）
        - evolution_generate/evolution_eval/reflexion → DeepSeek（推理强）
        - chat/reasoning/code → GLM-5.1（中文业务）
        - 其他 → 当前默认provider
        """
        model = TASK_MODELS.get(task)

        # 任务隧道：走本地
        if task in TUNNEL_TASKS:
            return await self.tunnel_chat(messages, task=task, **kwargs)

        # DeepSeek任务
        if model and model.startswith("deepseek"):
            ds = self.deepseek_provider
            if ds:
                try:
                    return await ds.chat(messages, model=model, **kwargs)
                except Exception as e:
                    logger.warning(f"DeepSeek调用失败({task})，回退默认: {e}")
            # fallback到默认provider
            return await self.provider.chat(messages, **kwargs)

        # 默认：用当前provider + task对应的model
        if model:
            return await self.provider.chat(messages, model=model, **kwargs)
        return await self.provider.chat(messages, **kwargs)

    async def switch_provider(self, provider_id: str, api_key: str | None = None):
        """Switch to a different AI provider."""
        if provider_id not in PROVIDERS:
            raise ValueError(f"Unknown provider: {provider_id}. Available: {list(PROVIDERS.keys())}")

        config = PROVIDERS[provider_id]
        key = api_key or os.getenv(config["api_key_env"])  # noqa: F821

        await self.provider.close()
        self.provider = OpenAICompatibleProvider(
            api_key=key,
            base_url=config["base_url"],
        )
        self.provider_id = provider_id

        # Update task models to use provider's default model
        # 注意：只更新通用任务，不影响隧道(local)和DeepSeek专用key
        default_model = config["default_model"]
        TASK_MODELS["default"] = default_model
        TASK_MODELS["chat"] = default_model
        TASK_MODELS["reasoning"] = default_model
        TASK_MODELS["code"] = default_model

        # Try to find a vision model from the provider
        vision_models = [m for m in config["models"] if m["category"] == "vision"]
        if vision_models:
            TASK_MODELS["ocr_vision"] = vision_models[0]["id"]
            TASK_MODELS["ocr_extract"] = vision_models[0]["id"]

        logger.info(f"Switched AI provider to {provider_id} ({config['name']}), base_url={config['base_url']}")

    def get_provider_info(self) -> dict:
        """Get current provider info with all available providers."""
        current = {
            "id": self.provider_id,
            "name": PROVIDERS.get(self.provider_id, {}).get("name", "Custom"),
            "base_url": self.provider.base_url,
            "api_key_set": bool(self.provider.api_key),
            "models": PROVIDERS.get(self.provider_id, {}).get("models", []),
        }
        available = []
        for pid, p in PROVIDERS.items():
            available.append({
                "id": pid,
                "name": p["name"],
                "base_url": p["base_url"],
                "default_model": p["default_model"],
                "model_count": len(p["models"]),
                "api_key_env": p["api_key_env"],
                "api_key_set": bool(os.getenv(p["api_key_env"])),  # noqa: F821
            })
        return {"current": current, "available": available}

    async def recognize_contract(self, image_base64: str) -> dict:
        prompt = (
            "你是一位资深合同审核专家，擅长精确提取合同关键信息。请对这份合同进行深度识别。\n\n"

            "## 第一步：文档结构分析\n"
            "观察整体结构：是封面/正文/签章页/多页合同？确定文档类型和布局。\n\n"

            "## 第二步：逐区域精确提取\n"

            "### 标题与编号\n"
            "- 合同完整标题（含协议书/补充协议等字样）\n"
            "- 合同编号（通常在右上角或标题下方，格式如HT-2024-001）\n\n"

            "### 当事人信息\n"
            "- 甲方（委托方/发包方/买方/出租方）完整公司名称，包含有限公司等后缀\n"
            "- 乙方（受托方/承包方/卖方/承租方）完整公司名称\n"
            "- 如有丙方也提取\n"
            "- 各方法定代表人姓名\n\n"

            "### 金额\n"
            "- 合同总金额数字和大写\n"
            "- 单价（如有）\n"
            "- 质保金比例和金额\n\n"

            "### 日期\n"
            "- 签订日期、合同开始日期、合同结束日期\n"
            "- 工期/服务期限描述文字\n\n"

            "### 付款条款\n"
            "- 完整付款方式和节点描述\n"
            "- 分期付款明细（各期比例、金额、触发条件）\n\n"

            "### 核心条款\n"
            "- 提取所有重要条款摘要（质量标准、违约责任、争议解决、保密、知识产权等）\n\n"

            "## 第三步：交叉验证\n"
            "- 金额数字与大写是否一致\n"
            "- 日期逻辑：sign_date <= start_date <= end_date\n"
            "- 公司名称完整性\n\n"

            "## 提取规则\n"
            "- 金额：提取纯数字去掉¥￥元逗号，如1,230,000.00→1230000.00\n"
            "- 日期：统一YYYY-MM-DD，如2024年1月15日→2024-01-15\n"
            "- 公司名称：保持完整，含有限公司/股份公司后缀\n"
            "- 模糊文字根据上下文推断，完全不可辨设为null\n"
            "- payment_installments仅在有明确分期信息时提取，否则为null\n\n"

            "返回JSON：\n"
            '{\n'
            '  "contract_no": "合同编号",\n'
            '  "contract_name": "合同完整标题",\n'
            '  "description": "一句话概括合同性质和主要内容",\n'
            '  "party_a": "甲方完整公司名称",\n'
            '  "party_b": "乙方完整公司名称",\n'
            '  "party_c": "丙方名称或null",\n'
            '  "party_a_representative": "甲方法定代表人",\n'
            '  "party_b_representative": "乙方法定代表人",\n'
            '  "amount": 合同金额数字,\n'
            '  "amount_cn": "合同金额中文大写",\n'
            '  "total_amount": 合同总金额数字,\n'
            '  "warranty_rate": 质保金比例(如0.03)或null,\n'
            '  "warranty_amount": 质保金金额或null,\n'
            '  "sign_date": "签订日期(YYYY-MM-DD)",\n'
            '  "start_date": "开始日期(YYYY-MM-DD)",\n'
            '  "end_date": "结束日期(YYYY-MM-DD)",\n'
            '  "duration_description": "工期/服务期限描述",\n'
            '  "project_location": "项目地点/工程地点",\n'
            '  "payment_terms": "付款条款完整描述",\n'
            '  "payment_installments": [{"phase":"阶段","percent":比例,"amount":金额,"condition":"条件"}]或null,\n'
            '  "key_clauses": ["条款1","条款2"],\n'
            '  "quality_standard": "质量标准",\n'
            '  "breach_liability": "违约责任摘要",\n'
            '  "dispute_resolution": "争议解决方式",\n'
            '  "contact_person": "联系人",\n'
            '  "contact_phone": "联系电话"\n'
            '}\n'
            "【重要】直接输出JSON对象，不要markdown标记。无法识别的字段设为null。"
        )
        result = await self.provider.vision(image_base64, prompt, model=get_model_for_task("ocr_vision"))
        return self._parse_json(result)

    async def recognize_invoice(self, image_base64: str) -> dict:
        prompt = (
            "你是一个发票识别专家。请仔细识别这张发票图片，提取完整的发票信息。\n\n"
            "第一步：先观察发票的整体布局，确定是纸质发票还是电子发票，找到关键区域（购方/销方/明细/合计）的位置。\n"
            "第二步：逐区域精确提取每个字段的文字内容。\n\n"
            "识别规则：\n"
            "- 仔细辨认发票上的每一个字段，包括印刷体和手写体\n"
            "- 发票类型根据票面判断：增值税专用发票/增值税普通发票/电子发票/机动车销售统一发票等\n"
            "- 电子发票通常在票面顶部有「电子发票」字样，结构紧凑，购买方和销售方信息在左右两侧\n"
            "- 金额全部转为数字，去掉¥、￥、元、逗号\n"
            "- 税率转为小数（如13%→0.13），如果票面写的是百分比就保持百分比数值\n"
            "- 日期格式 YYYY-MM-DD\n"
            "- 校验逻辑：total_amount ≈ amount_without_tax + tax_amount，如果不等请重新检查各金额字段\n"
            "- items数组中的每个字段也要精确提取\n"
            "- 发票代码和发票号码是不同字段，代码通常10-12位，号码通常8位\n\n"
            "返回JSON：\n"
            '{\n'
            '  "invoice_type": "发票类型全称(字符串)",\n'
            '  "invoice_code": "发票代码(字符串)",\n'
            '  "invoice_no": "发票号码(字符串)",\n'
            '  "invoice_date": "开票日期(YYYY-MM-DD)",\n'
            '  "seller_name": "销方名称(字符串)",\n'
            '  "seller_tax_no": "销方纳税人识别号(字符串)",\n'
            '  "buyer_name": "购方名称(字符串)",\n'
            '  "buyer_tax_no": "购方纳税人识别号(字符串)",\n'
            '  "amount_without_tax": 不含税金额(数字),\n'
            '  "tax_rate": 税率(数字,如0.13),\n'
            '  "tax_amount": 税额(数字),\n'
            '  "total_amount": 价税合计(数字),\n'
            '  "items": [{"name":"货物名称","spec":"规格型号","unit":"单位","quantity":数量,"unit_price":单价,"amount":金额,"tax_rate":税率,"tax":税额}]\n'
            '}\n'
            "【重要】直接输出JSON对象。所有字段值必须是字符串或数字，不能嵌套对象。无法识别的字段设为null。"
        )
        result = await self.provider.vision(image_base64, prompt, model=get_model_for_task("ocr_vision"))
        return self._parse_json(result)

    async def recognize_receipt(self, image_base64: str) -> dict:
        prompt = (
            "你是一个票据识别专家。请识别这张消费小票/收据图片。\n\n"
            "识别规则：\n"
            "- 金额转为数字，去掉¥、￥、元\n"
            "- 日期格式 YYYY-MM-DD\n"
            "- category 根据商户类型推断：餐饮/交通/购物/娱乐/医疗/通讯/其他\n\n"
            "返回JSON：\n"
            '{\n'
            '  "type": "票据类型(字符串,如:餐饮小票/停车收据/出租车票)",\n'
            '  "date": "日期(YYYY-MM-DD)",\n'
            '  "amount": 金额(数字),\n'
            '  "merchant_name": "商户名称(字符串)",\n'
            '  "counterparty": "对方名称(字符串,与merchant_name相同)",\n'
            '  "category": "分类(字符串)",\n'
            '  "items": [{"name":"品名","quantity":数量,"amount":金额}]\n'
            '}\n'
            "【重要】直接输出JSON对象。无法识别的字段设为null。"
        )
        result = await self.provider.vision(image_base64, prompt, model=get_model_for_task("ocr_vision"))
        return self._parse_json(result)

    async def recognize_payment_doc(self, image_base64: str) -> dict:
        prompt = (
            "你是一个工程付款依据识别专家。请仔细识别这张付款依据图片。\n\n"
            "先判断子类型：\n"
            "1. delivery_note — 送货单：有送货单标题、收货单位、品名/数量/单价/金额、送货单位\n"
            "2. expense_record — 开支明细：手写记录的日期+费用项+金额（叉车/材料/人工等），无正式表头\n"
            "3. payment_proof — 付款证明单：有付款证明单标题、购货单位、品名明细、大写金额\n"
            "4. labor_record — 人工工时记录：记录大工/小工人数、日期、加班费、工日汇总\n"
            "5. material_list — 工程材料清单：电缆/电线等材料型号规格+数量\n"
            "6. other — 其他无法归类的付款依据\n\n"
            "提取规则：\n"
            "- 金额转为纯数字，去掉¥、￥、元、逗号\n"
            "- 日期格式 YYYY-MM-DD，多个日期取最早的\n"
            "- 手写文字尽量根据上下文辨认\n"
            "- labor_summary 仅对 labor_record 有效，其他类型设为 null\n"
            "- material_summary 仅对 material_list 有效，其他类型设为 null\n\n"
            "返回JSON：\n"
            '{\n'
            '  "doc_subtype": "delivery_note|expense_record|payment_proof|labor_record|material_list|other",\n'
            '  "doc_subtype_label": "送货单|开支明细|付款证明单|人工工时记录|材料清单|其他",\n'
            '  "date": "日期(YYYY-MM-DD)",\n'
            '  "project_location": "项目地点/工程位置(字符串)",\n'
            '  "counterparty": "供货方/施工方/对方名称(字符串)",\n'
            '  "receiver": "收货单位(字符串)",\n'
            '  "description": "摘要/用途描述(字符串)",\n'
            '  "total_amount": 总金额(数字),\n'
            '  "amount_cn": "大写金额(字符串)",\n'
            '  "items": [{"name":"品名(字符串)","spec":"规格型号(字符串)","unit":"单位(字符串)","quantity":数量(数字),"unit_price":单价(数字),"amount":金额(数字)}],\n'
            '  "labor_summary": {"skilled_days":大工工日(数字),"skilled_daily_rate":大工日薪(数字),"unskilled_days":小工工日(数字),"unskilled_daily_rate":小工日薪(数字),"overtime_total":加班费(数字)},\n'
            '  "material_summary": [{"model":"材料型号(字符串)","spec":"规格(字符串)","quantity":数量(数字),"unit":"单位(字符串)","color":"颜色(字符串)"}],\n'
            '  "remark": "备注(字符串)"\n'
            '}\n'
            "【重要】直接输出JSON对象。所有字段值必须是字符串或数字，不能嵌套未定义的对象。无法识别的字段设为null。"
        )
        result = await self.provider.vision(image_base64, prompt, model=get_model_for_task("ocr_vision"))
        return self._parse_json(result)

    async def recognize_construction_log(self, image_base64: str) -> dict:
        prompt = (
            "你是一个工程施工日志识别专家。请仔细识别这张施工日志/施工记录图片。\n\n"
            "识别规则：\n"
            "- 仔细辨认表单中每个字段的值\n"
            "- 日期格式 YYYY-MM-DD\n"
            "- 施工人数转为整数\n"
            "- 安全状态判定：有安全事故/严重隐患=danger，有一般隐患=warning，其余=normal\n"
            "- 工作内容完整提取，不要省略\n\n"
            "返回JSON：\n"
            '{\n'
            '  "date": "日志日期(YYYY-MM-DD)",\n'
            '  "weather": "天气(字符串,如:晴/阴/小雨)",\n'
            '  "temperature": "温度(字符串,如:25℃)",\n'
            '  "work_content": "工作内容详情(字符串,完整提取)",\n'
            '  "worker_count": 施工人数(整数),\n'
            '  "equipment_used": "使用设备(字符串)",\n'
            '  "materials_used": "使用材料(字符串)",\n'
            '  "safety_status": "normal|warning|danger",\n'
            '  "execution_unit": "施工单位(字符串)",\n'
            '  "quality_issues": "质量问题(字符串)",\n'
            '  "project_location": "项目地点/工程名称(字符串)",\n'
            '  "remark": "备注(字符串)"\n'
            '}\n'
            "【重要】直接输出JSON对象。无法识别的字段设为null。"
        )
        result = await self.provider.vision(image_base64, prompt, model=get_model_for_task("ocr_vision"))
        return self._parse_json(result)

    async def recognize_petty_cash_doc(self, image_base64: str) -> dict:
        prompt = (
            "你是一个备用金核销单据识别专家。请仔细识别这张备用金核销/报销单据图片。\n\n"
            "识别规则：\n"
            "- 金额转为纯数字，去掉¥、￥、元、逗号\n"
            "- 日期格式 YYYY-MM-DD\n"
            "- category 根据费用内容推断：餐饮/交通/材料/人工/办公用品/工程材料/其他\n"
            "- 大写金额保持原样作为字符串\n"
            "- items 提取费用明细列表\n\n"
            "返回JSON：\n"
            '{\n'
            '  "date": "报销/支出日期(YYYY-MM-DD)",\n'
            '  "category": "费用分类(字符串)",\n'
            '  "amount": 金额(数字),\n'
            '  "amount_cn": "大写金额(字符串)",\n'
            '  "description": "用途/摘要描述(字符串)",\n'
            '  "counterparty": "对方/供应商/商户名称(字符串)",\n'
            '  "project_location": "关联项目/工程名称(字符串)",\n'
            '  "invoice_count": 发票张数(整数),\n'
            '  "items": [{"name":"品名/费用项(字符串)","amount":金额(数字),"remark":"备注(字符串)"}],\n'
            '  "remark": "备注(字符串)"\n'
            '}\n'
            "【重要】直接输出JSON对象。无法识别的字段设为null。"
        )
        result = await self.provider.vision(image_base64, prompt, model=get_model_for_task("ocr_vision"))
        return self._parse_json(result)

    async def smart_fill(self, form_type: str, extracted_data: dict, existing_data: dict | None = None) -> dict:
        context = f"已有数据：{json.dumps(existing_data, ensure_ascii=False)}" if existing_data else "无已有数据"
        prompt = (
            f"基于OCR识别的数据，为{form_type}表单建议字段映射。\n"
            f"OCR数据：{json.dumps(extracted_data, ensure_ascii=False)}\n"
            f"{context}\n"
            "返回JSON格式的字段映射建议，格式：{\"mappings\":{\"表单字段\":\"建议值\"},\"confidence\":0.95}\n"
            "【重要】直接输出JSON对象，不要输出任何解释、前缀、后缀或markdown标记。"
        )
        result = await self.provider.chat([{"role": "user", "content": prompt}], model=get_model_for_task("reasoning"))
        return self._parse_json(result)

    async def analyze_document(self, document_text: str, analysis_type: str) -> dict:
        prompts = {
            "risk": "请分析以下文档的风险点，返回JSON：{\"risk_level\":\"高/中/低\",\"risks\":[{\"item\":\"风险项\",\"description\":\"描述\",\"suggestion\":\"建议\"}]}",
            "compliance": "请检查以下文档的合规性，返回JSON：{\"compliant\":true,\"issues\":[{\"item\":\"问题项\",\"description\":\"描述\",\"regulation\":\"相关法规\"}]}",
            "summary": "请总结以下文档的核心内容，返回JSON：{\"title\":\"标题\",\"summary\":\"摘要\",\"key_points\":[\"要点\"],\"action_items\":[\"待办\"]}",
        }
        system_prompt = prompts.get(analysis_type, prompts["summary"])
        result = await self.provider.chat(
            [
                {"role": "system", "content": system_prompt + "\n【重要】直接输出JSON对象，不要输出任何解释、前缀、后缀或markdown标记。"},
                {"role": "user", "content": document_text},
            ],
            model=get_model_for_task("reasoning"),
        )
        return self._parse_json(result)

    async def generate_report(self, report_type: str, data: dict, template: str | None = None) -> dict:
        template_desc = f"使用模板：{template}" if template else ""
        prompt = (
            f"请根据以下数据生成{report_type}报告。{template_desc}\n"
            f"数据：{json.dumps(data, ensure_ascii=False)}\n"
            "返回JSON：{\"title\":\"报告标题\",\"sections\":[{\"heading\":\"标题\",\"content\":\"内容\",\"charts\":[]}],\"summary\":\"总结\"}\n"
            "【重要】直接输出JSON对象，不要输出任何解释、前缀、后缀或markdown标记。"
        )
        result = await self.provider.chat([{"role": "user", "content": prompt}], model=get_model_for_task("reasoning"))
        return self._parse_json(result)

    async def batch_process(self, images: list[str], process_type: str) -> list[dict]:
        handlers = {
            "invoice": self.recognize_invoice,
            "contract": self.recognize_contract,
            "receipt": self.recognize_receipt,
            "payment_doc": self.recognize_payment_doc,
            "construction_log": self.recognize_construction_log,
            "petty_cash_settlement": self.recognize_petty_cash_doc,
        }
        handler = handlers.get(process_type)
        if not handler:
            raise ValueError(f"不支持的处理类型: {process_type}")
        return [await handler(img) for img in images]

    def get_status(self) -> dict:
        return {
            "provider_id": self.provider_id,
            "provider": type(self.provider).__name__,
            "base_url": self.provider.base_url,
            "api_key_configured": bool(self.provider.api_key),
            "usage": self.provider.get_usage(),
            "task_models": TASK_MODELS,
            **self._status,
        }

    def _parse_json(self, text: str) -> dict:
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        for open_ch, close_ch in [("{", "}"), ("[", "]")]:
            start = text.find(open_ch)
            if start == -1:
                continue
            depth = 0
            end = -1
            for i in range(start, len(text)):
                if text[i] == open_ch:
                    depth += 1
                elif text[i] == close_ch:
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end > start:
                candidate = text[start:end]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    continue
        return {"raw_text": text, "parse_error": True}

    def parse_json_response(self, text: str) -> dict:
        """公开的JSON解析方法，供其他模块使用"""
        return self._parse_json(text)


ai_gateway = AIGateway()
