import os
import re
import math
from pathlib import Path
from typing import List, Dict, Any
from dataclasses import dataclass

@dataclass
class SecretFinding:
    rule_id: str
    rule_name: str
    severity: str
    file_path: str
    line_number: int
    line_content: str
    match_content: str
    match_start: int
    match_end: int
    confidence: float
    description: str
    remediation: str = ""


class SecretScanner:
    ENTROPY_THRESHOLD = 4.5
    
    PATTERNS = [
        {
            "id": "secret-api-key",
            "name": "Hardcoded API Key",
            "severity": "critical",
            "pattern": re.compile(
                r'(?i)(api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*["\']?([a-zA-Z0-9_\-]{16,})["\']?',
                re.MULTILINE
            ),
            "description": "检测到硬编码的API密钥",
            "remediation": "将API密钥移至环境变量或密钥管理服务",
            "confidence": 0.95,
        },
        {
            "id": "secret-password",
            "name": "Hardcoded Password",
            "severity": "critical",
            "pattern": re.compile(
                r'(?i)(password|passwd|pwd)\s*[:=]\s*["\']([^"\']{4,})["\']',
                re.MULTILINE
            ),
            "description": "检测到硬编码的密码",
            "remediation": "将密码移至环境变量或配置中心",
            "confidence": 0.9,
        },
        {
            "id": "secret-token",
            "name": "Hardcoded Token",
            "severity": "high",
            "pattern": re.compile(
                r'(?i)(token|access[_-]?token|auth[_-]?token)\s*[:=]\s*["\']?([a-zA-Z0-9_\-]{20,})["\']?',
                re.MULTILINE
            ),
            "description": "检测到硬编码的访问令牌",
            "remediation": "将令牌移至环境变量或密钥管理服务",
            "confidence": 0.9,
        },
        {
            "id": "secret-aws-key",
            "name": "AWS Access Key",
            "severity": "critical",
            "pattern": re.compile(r'AKIA[0-9A-Z]{16}', re.MULTILINE),
            "description": "检测到AWS访问密钥ID",
            "remediation": "使用IAM角色或环境变量配置AWS凭证",
            "confidence": 0.98,
        },
        {
            "id": "secret-private-key",
            "name": "Private Key",
            "severity": "critical",
            "pattern": re.compile(
                r'-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----',
                re.MULTILINE
            ),
            "description": "检测到私钥文件",
            "remediation": "将私钥文件移至安全存储，切勿提交到版本控制",
            "confidence": 0.99,
        },
        {
            "id": "secret-database-url",
            "name": "Database Connection String",
            "severity": "high",
            "pattern": re.compile(
                r'(?i)(mongodb|mysql|postgresql|postgres|redis)://[^:]+:[^@]+@',
                re.MULTILINE
            ),
            "description": "检测到包含密码的数据库连接字符串",
            "remediation": "使用连接池配置或密钥管理服务",
            "confidence": 0.95,
        },
        {
            "id": "secret-jwt",
            "name": "JWT Secret",
            "severity": "high",
            "pattern": re.compile(
                r'(?i)(jwt[_-]?secret|secret[_-]?key)\s*[:=]\s*["\']?([a-zA-Z0-9_\-]{16,})["\']?',
                re.MULTILINE
            ),
            "description": "检测到硬编码的JWT密钥",
            "remediation": "使用环境变量或密钥管理服务存储JWT密钥",
            "confidence": 0.9,
        },
        {
            "id": "secret-entropy",
            "name": "High Entropy String",
            "severity": "medium",
            "pattern": re.compile(
                r'["\']([a-zA-Z0-9+/=]{32,})["\']',
                re.MULTILINE
            ),
            "description": "检测到高熵字符串，可能是密钥或令牌",
            "remediation": "检查是否为硬编码密钥，如果是请移至环境变量",
            "confidence": 0.6,
        },
    ]
    
    SCAN_EXTENSIONS = {'.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.go', '.rb', '.php', 
                       '.c', '.cpp', '.h', '.cs', '.swift', '.kt', '.rs', '.sh', '.yml', 
                       '.yaml', '.json', '.xml', '.properties', '.env', '.cfg', '.ini'}
    
    SKIP_FILES = {'package-lock.json', 'yarn.lock', 'Pipfile.lock', 'poetry.lock', 
                  '.pyc', '.min.js', '.bundle.js'}
    
    def __init__(self, entropy_threshold: float = None):
        self.entropy_threshold = entropy_threshold or self.ENTROPY_THRESHOLD
    
    def calculate_entropy(self, string: str) -> float:
        if not string:
            return 0.0
        prob = [float(string.count(c)) / len(string) for c in dict.fromkeys(list(string))]
        entropy = - sum([p * math.log(p, 2) for p in prob])
        return entropy
    
    def should_scan_file(self, file_path: Path) -> bool:
        if file_path.name in self.SKIP_FILES:
            return False
        if file_path.suffix not in self.SCAN_EXTENSIONS:
            return False
        skip_dirs = {'node_modules', '.git', '__pycache__', '.pytest_cache', 
                     'venv', '.venv', 'dist', 'build', '.tox', '.mypy_cache'}
        for part in file_path.parts:
            if part in skip_dirs:
                return False
        return True
    
    def scan_file(self, file_path: str) -> List[SecretFinding]:
        findings = []
        path = Path(file_path)
        
        if not self.should_scan_file(path):
            return findings
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                lines = content.split('\n')
        except Exception:
            return findings
        
        for rule in self.PATTERNS:
            for match in rule['pattern'].finditer(content):
                line_num = content[:match.start()].count('\n') + 1
                line_content = lines[line_num - 1] if line_num <= len(lines) else ''
                
                if rule['id'] == 'secret-entropy':
                    matched_text = match.group(1)
                    entropy = self.calculate_entropy(matched_text)
                    if entropy < self.entropy_threshold:
                        continue
                    confidence = min(0.9, 0.5 + (entropy - self.entropy_threshold) / 5)
                else:
                    confidence = rule['confidence']
                
                finding = SecretFinding(
                    rule_id=rule['id'],
                    rule_name=rule['name'],
                    severity=rule['severity'],
                    file_path=file_path,
                    line_number=line_num,
                    line_content=line_content.strip(),
                    match_content=match.group(0),
                    match_start=match.start(),
                    match_end=match.end(),
                    confidence=confidence,
                    description=rule['description'],
                    remediation=rule['remediation'],
                )
                findings.append(finding)
        
        return findings
    
    def scan_directory(self, directory: str, max_files: int = 1000) -> List[SecretFinding]:
        findings = []
        path = Path(directory)
        files_scanned = 0
        
        for file_path in path.rglob('*'):
            if file_path.is_file() and self.should_scan_file(file_path):
                if files_scanned >= max_files:
                    break
                findings.extend(self.scan_file(str(file_path)))
                files_scanned += 1
        
        severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        findings.sort(key=lambda x: (severity_order.get(x.severity, 4), -x.confidence))
        
        return findings
    
    def generate_report(self, findings: List[SecretFinding]) -> Dict[str, Any]:
        severity_counts = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
        for finding in findings:
            severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1
        
        return {
            'total_findings': len(findings),
            'severity_counts': severity_counts,
            'critical_count': severity_counts['critical'],
            'high_count': severity_counts['high'],
            'files_affected': len(set(f.file_path for f in findings)),
            'findings': [
                {
                    'rule_id': f.rule_id,
                    'rule_name': f.rule_name,
                    'severity': f.severity,
                    'file_path': f.file_path,
                    'line_number': f.line_number,
                    'line_content': f.line_content,
                    'match_content': f.match_content,
                    'confidence': round(f.confidence, 2),
                    'description': f.description,
                    'remediation': f.remediation,
                }
                for f in findings
            ]
        }
