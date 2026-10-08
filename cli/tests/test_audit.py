"""Exercise CLI requests and exit codes with an isolated HTTP service."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import tempfile
from threading import Thread
import unittest

ROOT = Path(__file__).resolve().parents[2]


class AuditCliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.document = Path(self.tmp.name) / "document.txt"
        self.document.write_text("API version 3.0.0\n", encoding="utf-8")
        self.requests = []
        self.books = [{"id": "policy", "name": "Platform log compliance"}]
        self.scan = {"id": "scan", "sourceName": "document.txt", "rulebookName": "Test policy", "lineCount": 1, "errorCount": 0, "warningCount": 0, "infoCount": 0, "findings": []}
        self.sarif = {"version": "2.1.0", "runs": [{"tool": {"driver": {"name": "TeddySnow"}}, "results": [{"ruleId": "test", "message": {"text": "Test"}, "locations": [{"physicalLocation": {"artifactLocation": {"uri": "wrong.txt"}, "region": {"startLine": 1}}}]}]}]}
        self.export_status = 200
        self.upload_status = 200
        self.health_status = 200
        case = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_GET(self):
                case.requests.append(("GET", self.path))
                status = 200
                if self.path == "/api/health":
                    status = case.health_status
                    body = {"status": "ok"}
                elif self.path == "/api/rulebooks":
                    body = case.books
                elif self.path.endswith("/sarif"):
                    status = case.export_status
                    body = case.sarif
                else:
                    body = {"error": "Not found"}
                    status = 404
                self.reply(status, body)

            def do_POST(self):
                case.requests.append(("POST", self.path))
                self.rfile.read(int(self.headers.get("Content-Length", 0)))
                self.reply(case.upload_status, case.scan)

            def reply(self, status, body):
                data = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def run_cli(self, *args):
        return subprocess.run([str(ROOT / "cli/audit.sh"), str(self.document), "--server", f"http://127.0.0.1:{self.server.server_port}", *args], cwd=ROOT, capture_output=True, text=True, timeout=15)

    def test_pass_and_failure_thresholds_preserve_machine_readable_output(self):
        result = self.run_cli("--format", "json")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("scan", json.loads(result.stdout)["id"])
        self.scan["warningCount"] = 1
        self.assertEqual(0, self.run_cli("--format", "json").returncode)
        self.assertEqual(1, self.run_cli("--format", "json", "--fail-on", "warning").returncode)
        self.scan["errorCount"] = 1
        self.assertEqual(1, self.run_cli("--format", "json").returncode)

    def test_sarif_written_before_policy_exit_and_paths_are_correct(self):
        self.scan["errorCount"] = 1
        output = Path(self.tmp.name) / "report.sarif"
        result = self.run_cli("--format", "sarif", "-o", str(output))
        self.assertEqual(1, result.returncode, result.stderr)
        report = json.loads(output.read_text())
        run = report["runs"][0]
        uri = run["results"][0]["locations"][0]["physicalLocation"]["artifactLocation"]["uri"]
        self.assertEqual(self.document.as_uri(), uri)
        self.assertEqual(f"compliance/{uri}/", run["automationDetails"]["id"])
        self.assertEqual("", result.stdout)

    def test_checkout_relative_sarif_path_and_openapi_policy_detection(self):
        self.document = ROOT / "samples/openapi-spec.yaml"
        self.books = [{"id": "openapi", "name": "API & OpenAPI Spec Compliance"}, *self.books]
        result = self.run_cli("--format", "sarif")
        self.assertEqual(0, result.returncode, result.stderr)
        uri = json.loads(result.stdout)["runs"][0]["results"][0]["locations"][0]["physicalLocation"]["artifactLocation"]["uri"]
        self.assertEqual("samples/openapi-spec.yaml", uri)
        self.assertIn(("POST", "/api/scans/upload?rulebookId=openapi"), self.requests)

    def test_unknown_or_ambiguous_rulebook_does_not_fall_back(self):
        self.assertEqual(2, self.run_cli("--rulebook", "Not a saved book").returncode)
        self.books.append({"id": "second", "name": "Other log compliance"})
        self.assertEqual(2, self.run_cli("--rulebook", "log compliance").returncode)
        self.assertFalse(any(method == "POST" for method, _ in self.requests))

    def test_rulebook_name_quotes_are_literal_data(self):
        self.books = [{"id": "quoted", "name": "Teddy's ''' policy"}]
        result = self.run_cli("--rulebook", "Teddy's ''' policy", "--format", "json")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn(("POST", "/api/scans/upload?rulebookId=quoted"), self.requests)

    def test_http_failures_are_infrastructure_errors(self):
        self.health_status = 503
        self.assertEqual(2, self.run_cli("--format", "sarif").returncode)
        self.health_status = 200
        self.upload_status = 500
        self.assertEqual(2, self.run_cli("--format", "sarif").returncode)
        self.upload_status = 200
        self.export_status = 500
        self.assertEqual(2, self.run_cli("--format", "sarif").returncode)

    def test_invalid_scan_and_export_never_claim_a_pass(self):
        self.scan.pop("errorCount")
        self.assertEqual(2, self.run_cli("--format", "json").returncode)
        self.scan["errorCount"] = 0
        self.sarif = {"error": "not a report"}
        output = Path(self.tmp.name) / "missing.sarif"
        self.assertEqual(2, self.run_cli("--format", "sarif", "-o", str(output)).returncode)
        self.assertFalse(output.exists())

    def test_invalid_arguments_exit_promptly_without_api_requests(self):
        for arguments in [("--format", "invalid"), ("--fail-on", "invalid"), ("--format",), ("--unknown",)]:
            with self.subTest(arguments=arguments):
                self.assertEqual(2, self.run_cli(*arguments).returncode)
        self.assertEqual([], self.requests)

    def test_terminal_output_can_be_saved(self):
        output = Path(self.tmp.name) / "report.txt"
        result = self.run_cli("--format", "terminal", "-o", str(output))
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("Compliance Audit Report", output.read_text())
        self.assertEqual("", result.stdout)


if __name__ == "__main__":
    unittest.main()
