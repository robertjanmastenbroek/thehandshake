#!/usr/bin/env python3
"""
Auto-Fix Script - Analyzes GitHub Actions logs and automatically fixes code issues

Uses Claude API to:
1. Read GitHub Actions logs
2. Identify errors
3. Analyze affected code
4. Generate and apply fixes
5. Commit and push
"""

import os
import sys
import json
import subprocess
import re
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from anthropic import Anthropic
except ImportError:
    print("❌ anthropic package not installed")
    print("Install with: pip install anthropic --break-system-packages")
    sys.exit(1)


class AutoFixer:
    def __init__(self):
        self.anthropic = Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
        self.repo_root = Path(__file__).parent.parent
        self.max_iterations = 3

    def run_command(self, cmd, shell=False):
        """Run a shell command and return output"""
        try:
            result = subprocess.run(
                cmd if shell else cmd.split(),
                capture_output=True,
                text=True,
                shell=shell,
                cwd=self.repo_root
            )
            return result.stdout, result.stderr, result.returncode
        except Exception as e:
            return "", str(e), 1

    def get_latest_logs(self):
        """Fetch latest GitHub Actions logs"""
        print("📥 Fetching latest GitHub Actions logs...")

        stdout, stderr, code = self.run_command(
            "gh run list --workflow=moltbook.yml --limit=1 --json databaseId,conclusion",
            shell=True
        )

        if code != 0:
            print(f"❌ Failed to fetch runs: {stderr}")
            return None

        runs = json.loads(stdout)
        if not runs:
            print("⚠️  No workflow runs found")
            return None

        run_id = runs[0]['databaseId']
        conclusion = runs[0]['conclusion']

        print(f"📊 Latest run: {run_id} ({conclusion})")

        # Fetch logs
        stdout, stderr, code = self.run_command(
            f"gh run view {run_id} --log",
            shell=True
        )

        if code != 0:
            print(f"❌ Failed to fetch logs: {stderr}")
            return None

        return stdout

    def analyze_logs_with_claude(self, logs):
        """Use Claude to analyze logs and identify issues"""
        print("\n🤖 Analyzing logs with Claude...\n")

        prompt = f"""Analyze these GitHub Actions logs from a Moltbook agent run and identify all errors:

<logs>
{logs[-10000:]}  # Last 10k chars
</logs>

Identify:
1. What errors occurred?
2. Which files are affected?
3. What's the root cause?
4. What needs to be fixed?

Return JSON:
{{
  "has_errors": true/false,
  "errors": [
    {{
      "type": "TypeError|404|etc",
      "message": "error message",
      "file": "path/to/file.js",
      "line": 123,
      "root_cause": "explanation",
      "fix_needed": "what to change"
    }}
  ],
  "summary": "overall analysis"
}}
"""

        response = self.anthropic.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}]
        )

        content = response.content[0].text

        # Extract JSON from response
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(0))

        return {"has_errors": False, "errors": [], "summary": "Could not parse analysis"}

    def generate_fix_with_claude(self, error, file_content):
        """Use Claude to generate a fix for the error"""
        print(f"\n🔧 Generating fix for {error['file']}...\n")

        prompt = f"""Fix this error in the code:

ERROR: {error['type']} - {error['message']}
FILE: {error['file']}
ROOT CAUSE: {error['root_cause']}
FIX NEEDED: {error['fix_needed']}

<current_code>
{file_content}
</current_code>

Return the COMPLETE fixed file content. No explanations, just the full corrected code.
"""

        response = self.anthropic.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=8000,
            messages=[{"role": "user", "content": prompt}]
        )

        return response.content[0].text

    def apply_fix(self, file_path, new_content):
        """Apply the fix to the file"""
        try:
            full_path = self.repo_root / file_path

            # Backup original
            backup_path = full_path.with_suffix(full_path.suffix + '.backup')
            if full_path.exists():
                full_path.rename(backup_path)

            # Write new content
            full_path.write_text(new_content)

            print(f"✓ Applied fix to {file_path}")
            return True

        except Exception as e:
            print(f"❌ Failed to apply fix: {e}")

            # Restore backup
            if backup_path.exists():
                backup_path.rename(full_path)

            return False

    def commit_and_push(self, message):
        """Commit and push changes"""
        print("\n📝 Committing fixes...")

        # Remove git lock
        lock_file = self.repo_root / '.git' / 'index.lock'
        if lock_file.exists():
            lock_file.unlink()

        # Git add
        stdout, stderr, code = self.run_command("git add -A")
        if code != 0:
            print(f"❌ Git add failed: {stderr}")
            return False

        # Git commit
        stdout, stderr, code = self.run_command(
            f'git commit -m "{message}"',
            shell=True
        )

        if code != 0 and "nothing to commit" not in stderr:
            print(f"❌ Git commit failed: {stderr}")
            return False

        # Git push
        print("🚀 Pushing to GitHub...")
        stdout, stderr, code = self.run_command("git push")

        if code != 0:
            print(f"❌ Git push failed: {stderr}")
            return False

        print("✓ Pushed successfully\n")
        return True

    def auto_fix_loop(self):
        """Main auto-fix loop"""
        print("\n╔══════════════════════════════════════════════════════════╗")
        print("║         🤖 AUTO-FIX LOOP v1.0                           ║")
        print("╚══════════════════════════════════════════════════════════╝\n")

        for iteration in range(1, self.max_iterations + 1):
            print(f"\n{'='*60}")
            print(f"   ITERATION {iteration} / {self.max_iterations}")
            print(f"{'='*60}\n")

            # Fetch logs
            logs = self.get_latest_logs()
            if not logs:
                print("⚠️  No logs to analyze")
                break

            # Analyze with Claude
            analysis = self.analyze_logs_with_claude(logs)

            if not analysis.get('has_errors', False):
                print("\n╔═══════════════════════════════════════════════════════╗")
                print("║           🎉 NO ERRORS FOUND! 🎉                      ║")
                print("╚═══════════════════════════════════════════════════════╝\n")
                print(analysis.get('summary', 'All tests passed!'))
                return True

            print(f"\n⚠️  Found {len(analysis['errors'])} error(s):")
            for i, error in enumerate(analysis['errors'], 1):
                print(f"\n{i}. {error['type']}: {error['message']}")
                print(f"   File: {error['file']}")
                print(f"   Fix needed: {error['fix_needed']}")

            # Ask user to confirm auto-fix
            print(f"\n🤖 Auto-fix these issues? (y/n): ", end='')
            response = input().strip().lower()

            if response != 'y':
                print("⏸️  Auto-fix cancelled by user")
                return False

            # Apply fixes
            fixed_files = []
            for error in analysis['errors']:
                file_path = error.get('file')
                if not file_path:
                    continue

                full_path = self.repo_root / file_path
                if not full_path.exists():
                    print(f"⚠️  File not found: {file_path}")
                    continue

                # Read current content
                current_content = full_path.read_text()

                # Generate fix
                fixed_content = self.generate_fix_with_claude(error, current_content)

                # Apply fix
                if self.apply_fix(file_path, fixed_content):
                    fixed_files.append(file_path)

            if not fixed_files:
                print("❌ No fixes applied")
                return False

            # Commit and push
            commit_msg = f"auto-fix: {analysis.get('summary', 'fixed errors from logs')}"
            if not self.commit_and_push(commit_msg):
                print("❌ Failed to commit/push fixes")
                return False

            # Wait for new run
            print("\n⏳ Waiting 30s for workflow to start...")
            import time
            time.sleep(30)

        print("\n⚠️  Max iterations reached - manual intervention needed")
        return False


def main():
    # Check environment
    if not os.getenv('ANTHROPIC_API_KEY'):
        print("❌ ANTHROPIC_API_KEY not set")
        sys.exit(1)

    # Check gh CLI
    result = subprocess.run(['which', 'gh'], capture_output=True)
    if result.returncode != 0:
        print("❌ GitHub CLI (gh) not installed")
        print("Install with: brew install gh")
        sys.exit(1)

    # Run auto-fixer
    fixer = AutoFixer()
    success = fixer.auto_fix_loop()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
