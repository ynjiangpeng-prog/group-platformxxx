import json
import subprocess
import tempfile
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class SemgrepFinding:
    rule_id: str
    rule_name: str
    severity: str
    file_path: str
    line_number: int
    column: int
    end_line: int
    end_column: int
    message: str
    code_snippet: str
    confidence: str
    cwe: Optional[str] = None
    owasp: Optional[str] = None
    fix: Optional[str] = None
    metadata: Dict[str, Any] = None


class SemgrepScanner:
    """Integration with Semgrep for SAST scanning."""
    
    # Default rule sets to use
    DEFAULT_RULES = [
        "p/security-audit",
        "p/owasp-top-ten",
        "p/cwe-top-25",
        "p/secrets",
        "p/python",
        "p/javascript",
        "p/typescript",
    ]
    
    # Severity mapping
    SEVERITY_MAP = {
        "ERROR": "high",
        "WARNING": "medium",
        "INFO": "low",
    }
    
    def __init__(self, rules: List[str] = None, timeout: int = 300):
        self.rules = rules or self.DEFAULT_RULES
        self.timeout = timeout
        self._check_semgrep()
    
    def _check_semgrep(self):
        """Check if semgrep is installed."""
        try:
            result = subprocess.run(
                ["semgrep", "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode != 0:
                raise RuntimeError("Semgrep is not properly installed")
        except FileNotFoundError:
            raise RuntimeError(
                "Semgrep is not installed. Please install it: pip install semgrep"
            )
    
    def scan_file(self, file_path: str, rules: List[str] = None) -> List[SemgrepFinding]:
        """Scan a single file with Semgrep."""
        rules = rules or self.rules
        findings = []
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
            output_file = tmp.name
        
        try:
            cmd = [
                "semgrep",
                "--config", ",".join(rules),
                "--json",
                "--output", output_file,
                "--timeout", str(self.timeout),
                "--quiet",
                file_path,
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout + 30
            )
            
            # Semgrep returns exit code 1 when findings exist
            if result.returncode not in [0, 1]:
                logger.warning(f"Semgrep warning: {result.stderr}")
                return findings
            
            with open(output_file, 'r') as f:
                data = json.load(f)
            
            findings = self._parse_results(data)
            
        except subprocess.TimeoutExpired:
            logger.warning(f"Semgrep scan timed out for {file_path}")
        except Exception as e:
            logger.error(f"Error scanning {file_path}: {e}")
        finally:
            if os.path.exists(output_file):
                os.unlink(output_file)
        
        return findings
    
    def scan_directory(self, directory: str, rules: List[str] = None, 
                      max_target_bytes: int = 1000000) -> List[SemgrepFinding]:
        """Scan a directory with Semgrep."""
        rules = rules or self.rules
        findings = []
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
            output_file = tmp.name
        
        try:
            cmd = [
                "semgrep",
                "--config", ",".join(rules),
                "--json",
                "--output", output_file,
                "--timeout", str(self.timeout),
                "--max-target-bytes", str(max_target_bytes),
                "--quiet",
                directory,
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout + 60
            )
            
            if result.returncode not in [0, 1]:
                logger.warning(f"Semgrep warning: {result.stderr}")
                return findings
            
            with open(output_file, 'r') as f:
                data = json.load(f)
            
            findings = self._parse_results(data)
            
        except subprocess.TimeoutExpired:
            logger.warning(f"Semgrep scan timed out for {directory}")
        except Exception as e:
            logger.error(f"Error scanning {directory}: {e}")
        finally:
            if os.path.exists(output_file):
                os.unlink(output_file)
        
        # Sort by severity
        severity_order = {"high": 0, "medium": 1, "low": 2}
        findings.sort(key=lambda x: severity_order.get(x.severity, 3))
        
        return findings
    
    def _parse_results(self, data: Dict[str, Any]) -> List[SemgrepFinding]:
        """Parse Semgrep JSON output."""
        findings = []
        
        results = data.get("results", [])
        errors = data.get("errors", [])
        
        for result in results:
            finding = SemgrepFinding(
                rule_id=result.get("check_id", "unknown"),
                rule_name=result.get("extra", {}).get("metadata", {}).get("name", "Unknown"),
                severity=self.SEVERITY_MAP.get(
                    result.get("extra", {}).get("severity", "INFO"), 
                    "low"
                ),
                file_path=result.get("path", ""),
                line_number=result.get("start", {}).get("line", 0),
                column=result.get("start", {}).get("col", 0),
                end_line=result.get("end", {}).get("line", 0),
                end_column=result.get("end", {}).get("col", 0),
                message=result.get("extra", {}).get("message", ""),
                code_snippet=result.get("extra", {}).get("lines", ""),
                confidence=result.get("extra", {}).get("metadata", {}).get("confidence", "medium"),
                cwe=result.get("extra", {}).get("metadata", {}).get("cwe", ""),
                owasp=result.get("extra", {}).get("metadata", {}).get("owasp", ""),
                fix=result.get("extra", {}).get("fix", ""),
                metadata=result.get("extra", {}).get("metadata", {}),
            )
            findings.append(finding)
        
        return findings
    
    def generate_report(self, findings: List[SemgrepFinding]) -> Dict[str, Any]:
        """Generate scan report."""
        severity_counts = {"high": 0, "medium": 0, "low": 0}
        for finding in findings:
            severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1
        
        # Group by rule
        rules_stats = {}
        for finding in findings:
            rule_id = finding.rule_id
            if rule_id not in rules_stats:
                rules_stats[rule_id] = {
                    "name": finding.rule_name,
                    "count": 0,
                    "severity": finding.severity,
                }
            rules_stats[rule_id]["count"] += 1
        
        return {
            "total_findings": len(findings),
            "severity_counts": severity_counts,
            "high_count": severity_counts["high"],
            "medium_count": severity_counts["medium"],
            "low_count": severity_counts["low"],
            "files_affected": len(set(f.file_path for f in findings)),
            "rules_triggered": len(rules_stats),
            "rules_stats": rules_stats,
            "findings": [
                {
                    "rule_id": f.rule_id,
                    "rule_name": f.rule_name,
                    "severity": f.severity,
                    "file_path": f.file_path,
                    "line_number": f.line_number,
                    "column": f.column,
                    "message": f.message,
                    "code_snippet": f.code_snippet,
                    "confidence": f.confidence,
                    "cwe": f.cwe,
                    "owasp": f.owasp,
                    "fix": f.fix,
                }
                for f in findings
            ],
        }
