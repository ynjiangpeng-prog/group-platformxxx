import json
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from app.core.ai import AI_API_KEY, AI_API_BASE, AI_MODEL

logger = logging.getLogger(__name__)

@dataclass
class CodeReviewFinding:
    file_path: str
    line_number: int
    severity: str  # critical, high, medium, low, info
    category: str  # security, performance, maintainability, style, bug
    message: str
    suggestion: str
    code_snippet: str
    improved_code: Optional[str] = None
    explanation: Optional[str] = None


class AICodeReviewer:
    """AI-powered code review using LLM."""
    
    SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    
    def __init__(self):
        self.api_key = AI_API_KEY
        self.api_base = AI_API_BASE
        self.model = AI_MODEL
    
    def _build_review_prompt(self, code: str, file_path: str, language: str = None) -> str:
        """Build prompt for code review."""
        lang_hint = f" (Language: {language})" if language else ""
        
        prompt = f"""You are an expert code reviewer and security auditor. Please review the following code file{lang_hint}.

File: {file_path}

```
{code}
```

Please analyze this code for:
1. **Security Issues**: SQL injection, XSS, CSRF, path traversal, hardcoded secrets, weak crypto, auth bypass, etc.
2. **Bugs**: Logic errors, null pointer risks, race conditions, exception handling issues
3. **Performance**: Inefficient algorithms, N+1 queries, memory leaks, unnecessary computations
4. **Maintainability**: Code smells, duplication, complexity, naming issues
5. **Best Practices**: Pythonic/idiomatic code, type safety, documentation

For each issue found, provide:
- Severity: critical/high/medium/low/info
- Category: security/performance/maintainability/style/bug
- Line number (approximate)
- Clear description of the issue
- Specific suggestion for improvement
- Improved code example (if applicable)

Format your response as JSON:
{{
  "findings": [
    {{
      "line_number": 10,
      "severity": "high",
      "category": "security",
      "message": "Description of issue",
      "suggestion": "How to fix it",
      "improved_code": "if applicable"
    }}
  ],
  "summary": "Overall assessment",
  "security_score": 85,
  "quality_score": 80
}}

If no issues found, return empty findings array."""
        
        return prompt
    
    def _build_security_focused_prompt(self, code: str, file_path: str) -> str:
        """Build security-focused prompt."""
        prompt = f"""You are a security-focused code auditor. Perform a deep security analysis of the following code.

File: {file_path}

```
{code}
```

Focus ONLY on security issues:
- Input validation and sanitization
- Authentication and authorization flaws
- Data exposure and leakage
- Cryptographic weaknesses
- Injection vulnerabilities (SQL, command, LDAP, etc.)
- Path traversal and file inclusion
- SSRF and open redirects
- Business logic flaws
- OWASP Top 10 vulnerabilities

For each finding:
- severity: critical/high/medium/low
- cwe_id: CWE identifier if applicable
- owasp_category: OWASP category if applicable
- detailed explanation of the vulnerability
- proof of concept or exploitation scenario
- specific remediation steps
- secure code example

Format as JSON:
{{
  "findings": [...],
  "risk_level": "high",
  "attack_surface": ["list of exposed endpoints/inputs"],
  "recommendations": ["priority fixes"]
}}"""
        
        return prompt
    
    async def review_code(self, code: str, file_path: str, 
                         focus_security: bool = False) -> Dict[str, Any]:
        """Review code using AI."""
        try:
            import aiohttp
            
            if focus_security:
                prompt = self._build_security_focused_prompt(code, file_path)
            else:
                # Detect language from extension
                ext = file_path.split('.')[-1] if '.' in file_path else ''
                lang_map = {
                    'py': 'Python', 'js': 'JavaScript', 'ts': 'TypeScript',
                    'java': 'Java', 'go': 'Go', 'rb': 'Ruby', 'php': 'PHP',
                    'c': 'C', 'cpp': 'C++', 'cs': 'C#', 'swift': 'Swift',
                    'kt': 'Kotlin', 'rs': 'Rust'
                }
                language = lang_map.get(ext)
                prompt = self._build_review_prompt(code, file_path, language)
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": "You are an expert code reviewer and security auditor."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 4000,
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.api_base}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"AI API error: {error_text}")
                        return {"error": f"API error: {response.status}", "findings": []}
                    
                    result = await response.json()
                    content = result["choices"][0]["message"]["content"]
                    
                    # Extract JSON from response
                    try:
                        # Try to find JSON block
                        if "```json" in content:
                            json_str = content.split("```json")[1].split("```")[0]
                        elif "```" in content:
                            json_str = content.split("```")[1].split("```")[0]
                        else:
                            json_str = content
                        
                        review_data = json.loads(json_str)
                        return review_data
                    except json.JSONDecodeError:
                        logger.warning("Failed to parse AI response as JSON")
                        return {
                            "findings": [],
                            "summary": content[:500],
                            "security_score": 50,
                            "quality_score": 50,
                        }
                    
        except Exception as e:
            logger.exception("Code review failed")
            return {"error": str(e), "findings": []}
    
    async def review_file(self, file_path: str, focus_security: bool = False) -> Dict[str, Any]:
        """Review a file from disk."""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                code = f.read()
            
            # Truncate if too large
            max_chars = 8000
            if len(code) > max_chars:
                code = code[:max_chars] + "\n... [truncated]"
            
            return await self.review_code(code, file_path, focus_security)
        except Exception as e:
            logger.error(f"Failed to read file {file_path}: {e}")
            return {"error": str(e), "findings": []}
    
    def generate_review_report(self, reviews: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate aggregated review report."""
        all_findings = []
        for review in reviews:
            if "findings" in review:
                all_findings.extend(review["findings"])
        
        # Count by severity
        severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
        category_counts = {}
        
        for finding in all_findings:
            severity = finding.get("severity", "info").lower()
            severity_counts[severity] = severity_counts.get(severity, 0) + 1
            
            category = finding.get("category", "general")
            category_counts[category] = category_counts.get(category, 0) + 1
        
        # Calculate scores
        security_scores = [r.get("security_score", 0) for r in reviews if "security_score" in r]
        quality_scores = [r.get("quality_score", 0) for r in reviews if "quality_score" in r]
        
        avg_security = sum(security_scores) / len(security_scores) if security_scores else 0
        avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else 0
        
        return {
            "total_files_reviewed": len(reviews),
            "total_findings": len(all_findings),
            "severity_counts": severity_counts,
            "category_counts": category_counts,
            "average_security_score": round(avg_security, 1),
            "average_quality_score": round(avg_quality, 1),
            "overall_risk": "high" if severity_counts["critical"] > 0 or severity_counts["high"] > 3 else 
                          "medium" if severity_counts["high"] > 0 or severity_counts["medium"] > 5 else "low",
            "findings": all_findings,
        }
