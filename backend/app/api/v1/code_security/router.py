import logging
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.auth import get_current_user, get_db, require_permissions
from app.models.organization import User
from app.services.code_security import SecretScanner, SemgrepScanner, AICodeReviewer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/code-security", tags=["代码安全"])


# ── Schemas ──

class ScanRequest(BaseModel):
    target_path: str = Field(..., description="扫描目标路径")
    max_files: int = Field(1000, ge=1, le=5000)

class ScanResponse(BaseModel):
    scan_type: str
    total_findings: int
    severity_counts: dict
    files_affected: int
    findings: list

class AIReviewRequest(BaseModel):
    file_path: str = Field(..., description="要审查的文件路径")
    focus_security: bool = Field(False, description="是否仅关注安全问题")

class CodeReviewResponse(BaseModel):
    file_path: str
    findings: list
    summary: Optional[str] = None
    security_score: Optional[int] = None
    quality_score: Optional[int] = None

class BatchReviewRequest(BaseModel):
    directory: str = Field(..., description="要审查的目录")
    file_extensions: list[str] = Field(default=[".py", ".js", ".ts"])
    focus_security: bool = Field(False)


# ── Secret Scanning ──

@router.post("/scan/secrets", response_model=dict)
async def scan_secrets(
    body: ScanRequest,
    current_user: User = Depends(get_current_user),
):
    """扫描代码中的硬编码密钥和密码"""
    try:
        scanner = SecretScanner()
        findings = scanner.scan_directory(body.target_path, max_files=body.max_files)
        report = scanner.generate_report(findings)
        
        return {
            "scan_type": "secret_scan",
            "status": "completed",
            **report
        }
    except Exception as e:
        logger.exception("Secret scan failed")
        raise HTTPException(status_code=500, detail=f"扫描失败: {str(e)}")


@router.post("/scan/secrets/file", response_model=dict)
async def scan_secrets_file(
    file_path: str,
    current_user: User = Depends(get_current_user),
):
    """扫描单个文件中的密钥"""
    try:
        scanner = SecretScanner()
        findings = scanner.scan_file(file_path)
        report = scanner.generate_report(findings)
        
        return {
            "scan_type": "secret_scan",
            "target": file_path,
            **report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"扫描失败: {str(e)}")


# ── Semgrep SAST ──

@router.post("/scan/sast", response_model=dict)
async def scan_sast(
    body: ScanRequest,
    current_user: User = Depends(get_current_user),
):
    """使用Semgrep进行静态代码分析"""
    try:
        scanner = SemgrepScanner()
        findings = scanner.scan_directory(body.target_path)
        report = scanner.generate_report(findings)
        
        return {
            "scan_type": "sast_scan",
            "status": "completed",
            **report
        }
    except Exception as e:
        logger.exception("SAST scan failed")
        raise HTTPException(status_code=500, detail=f"扫描失败: {str(e)}")


@router.post("/scan/sast/file", response_model=dict)
async def scan_sast_file(
    file_path: str,
    rules: Optional[str] = Query(None, description="规则集，逗号分隔"),
    current_user: User = Depends(get_current_user),
):
    """扫描单个文件的SAST问题"""
    try:
        rule_list = rules.split(",") if rules else None
        scanner = SemgrepScanner(rules=rule_list)
        findings = scanner.scan_file(file_path)
        report = scanner.generate_report(findings)
        
        return {
            "scan_type": "sast_scan",
            "target": file_path,
            **report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"扫描失败: {str(e)}")


# ── AI Code Review ──

@router.post("/review/ai", response_model=dict)
async def ai_code_review(
    body: AIReviewRequest,
    current_user: User = Depends(get_current_user),
):
    """使用AI进行代码审查"""
    try:
        reviewer = AICodeReviewer()
        result = await reviewer.review_file(body.file_path, focus_security=body.focus_security)
        
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        
        return {
            "scan_type": "ai_review",
            "file_path": body.file_path,
            "focus_security": body.focus_security,
            **result
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("AI review failed")
        raise HTTPException(status_code=500, detail=f"审查失败: {str(e)}")


@router.post("/review/ai/code", response_model=dict)
async def ai_review_code_snippet(
    code: str,
    file_path: str = Query("snippet.py", description="文件名用于语言检测"),
    focus_security: bool = Query(False),
    current_user: User = Depends(get_current_user),
):
    """审查代码片段"""
    try:
        reviewer = AICodeReviewer()
        result = await reviewer.review_code(code, file_path, focus_security=focus_security)
        
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        
        return {
            "scan_type": "ai_review",
            "file_path": file_path,
            "focus_security": focus_security,
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"审查失败: {str(e)}")


@router.post("/review/ai/batch", response_model=dict)
async def ai_batch_review(
    body: BatchReviewRequest,
    current_user: User = Depends(get_current_user),
):
    """批量审查目录中的代码"""
    import os
    from pathlib import Path
    
    try:
        reviewer = AICodeReviewer()
        reviews = []
        
        path = Path(body.directory)
        files_scanned = 0
        max_files = 20  # Limit to avoid API costs
        
        for file_path in path.rglob("*"):
            if file_path.is_file() and file_path.suffix in body.file_extensions:
                if files_scanned >= max_files:
                    break
                
                result = await reviewer.review_file(
                    str(file_path), 
                    focus_security=body.focus_security
                )
                result["file_path"] = str(file_path)
                reviews.append(result)
                files_scanned += 1
        
        report = reviewer.generate_review_report(reviews)
        
        return {
            "scan_type": "ai_batch_review",
            "directory": body.directory,
            "files_scanned": files_scanned,
            **report
        }
    except Exception as e:
        logger.exception("Batch review failed")
        raise HTTPException(status_code=500, detail=f"批量审查失败: {str(e)}")


# ── Combined Scan ──

@router.post("/scan/full", response_model=dict)
async def full_security_scan(
    body: ScanRequest,
    current_user: User = Depends(get_current_user),
):
    """执行完整的安全扫描（密钥+SAST）"""
    try:
        # Run secret scan
        secret_scanner = SecretScanner()
        secret_findings = secret_scanner.scan_directory(body.target_path, max_files=body.max_files)
        secret_report = secret_scanner.generate_report(secret_findings)
        
        # Run SAST scan
        sast_scanner = SemgrepScanner()
        sast_findings = sast_scanner.scan_directory(body.target_path)
        sast_report = sast_scanner.generate_report(sast_findings)
        
        # Combine results
        total_critical = secret_report["severity_counts"].get("critical", 0) + sast_report["severity_counts"].get("high", 0)
        total_high = secret_report["severity_counts"].get("high", 0) + sast_report["severity_counts"].get("high", 0)
        
        risk_level = "critical" if total_critical > 0 else "high" if total_high > 2 else "medium" if total_high > 0 else "low"
        
        return {
            "scan_type": "full_scan",
            "status": "completed",
            "risk_level": risk_level,
            "secret_scan": secret_report,
            "sast_scan": sast_report,
            "summary": {
                "total_findings": secret_report["total_findings"] + sast_report["total_findings"],
                "critical_issues": total_critical,
                "high_issues": total_high,
                "files_affected": len(
                    set(f["file_path"] for f in secret_report["findings"]) | 
                    set(f["file_path"] for f in sast_report["findings"])
                ),
            }
        }
    except Exception as e:
        logger.exception("Full scan failed")
        raise HTTPException(status_code=500, detail=f"扫描失败: {str(e)}")


# ── Health Check ──

@router.get("/health")
async def security_tools_health():
    """检查安全工具状态"""
    import shutil
    
    tools = {
        "semgrep": shutil.which("semgrep") is not None,
        "bandit": shutil.which("bandit") is not None,
        "trufflehog": shutil.which("trufflehog") is not None,
        "secret_scanner": True,  # Pure Python
        "ai_reviewer": True,     # Depends on API key
    }
    
    return {
        "status": "healthy" if tools["semgrep"] else "partial",
        "tools_available": tools,
        "recommendations": [] if tools["semgrep"] else ["建议安装Semgrep: pip install semgrep"]
    }
