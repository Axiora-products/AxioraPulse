import os
import sys
import platform
import subprocess
import shutil
from pathlib import Path

# Ensure UTF-8 output encoding for consoles (especially on Windows)
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# --- Configuration ---
PYTHON_VERSION = "3.11.9"
# Go up one level from dev-tools to find backend/frontend
BASE_DIR = Path(__file__).parent.parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"
VENV_DIR = BACKEND_DIR / "venv"
SSM_PREFIX = "/axiorapulse/dev/"  # Adjust based on your environment

def run_command(command, cwd=None, env=None, shell=True):
    """Utility to run shell commands and stream output."""
    print(f"⚙️  Executing: {command}")
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        shell=shell,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    for line in process.stdout:
        print(line, end="")
    
    process.wait()
    if process.returncode != 0:
        print(f"💥 Error: Command failed with exit code {process.returncode}")
        sys.exit(process.returncode)

def detect_os():
    system = platform.system().lower()
    emoji = "🍎" if system == "darwin" else "🐧" if system == "linux" else "🪟"
    print(f"{emoji} Detected OS: {system}")
    return system

def setup_python():
    """Ensures Python 3.11.9 is installed via pyenv and returns its path."""
    print(f"🐍 Checking for Python {PYTHON_VERSION} via pyenv...")
    
    pyenv_bin = shutil.which("pyenv")
    if pyenv_bin is None:
        print("❌ Error: 'pyenv' not found.")
        print("\n💡 To fix this, please install pyenv:")
        print("   - macOS: 'brew install pyenv'")
        print("   - Windows: 'pip install pyenv-win --user' or use the installer: https://github.com/pyenv-win/pyenv-win")
        print("   - Linux: 'curl https://pyenv.run | bash'")
        sys.exit(1)

    # Check if version is installed
    try:
        versions = subprocess.check_output([pyenv_bin, "versions"]).decode()
    except subprocess.CalledProcessError:
        print("❌ Error: Failed to run 'pyenv versions'.")
        sys.exit(1)

    if PYTHON_VERSION not in versions:
        print(f"📥 Python {PYTHON_VERSION} not found on your system.")
        print(f"⏳ Automatically installing Python {PYTHON_VERSION} via pyenv... This may take a few minutes.")
        try:
            # Run install command
            run_command(f"{pyenv_bin} install {PYTHON_VERSION}")
            print(f"✨ Successfully installed Python {PYTHON_VERSION}!")
        except Exception as e:
            print(f"💥 Failed to install Python {PYTHON_VERSION}. You may be missing build dependencies.")
            print("   See: https://github.com/pyenv/pyenv/wiki#suggested-build-environment")
            sys.exit(1)
    else:
        print(f"✅ Python {PYTHON_VERSION} is already installed.")

    # Get the exact path to the python executable for this version
    try:
        if os.name == "nt":
            # On Windows, pyenv-win doesn't support 'prefix', but we know the path directly
            pyenv_root = str(Path(pyenv_bin).parent.parent)
            pyenv_prefix = str(Path(pyenv_root) / "versions" / PYTHON_VERSION)
        else:
            pyenv_prefix = subprocess.check_output([pyenv_bin, "prefix", PYTHON_VERSION]).decode().strip()
            
        python_exe = Path(pyenv_prefix) / "python.exe" if os.name == "nt" else Path(pyenv_prefix) / "bin" / "python"
        if not python_exe.exists():
            python_exe = Path(pyenv_prefix) / "bin" / "python"
        if not python_exe.exists():
            python_exe = Path(pyenv_prefix) / "bin" / "python3"
        if not python_exe.exists():
            python_exe = Path(pyenv_prefix) / "python"
        
        print(f"🎯 Using Python executable: {python_exe}")
        return str(python_exe)
    except Exception as e:
        print(f"❌ Error: Could not resolve path for Python {PYTHON_VERSION}. Details: {e}")
        sys.exit(1)

def clean_and_setup_venv(python_exe):
    """Cleans existing venv and creates a new one using the specified python."""
    abs_venv_dir = VENV_DIR.resolve()
    if abs_venv_dir.exists():
        print(f"🧹 Cleaning existing virtual environment at {abs_venv_dir}...")
        shutil.rmtree(abs_venv_dir)
    
    print(f"📦 Creating new virtual environment with {PYTHON_VERSION}...")
    run_command(f"{python_exe} -m venv {abs_venv_dir}")
    
    # Locate python inside venv
    if os.name == "nt":
        python_venv_exe = abs_venv_dir / "Scripts" / "python.exe"
    else:
        python_venv_exe = abs_venv_dir / "bin" / "python"

    print(f"🛠️  Installing backend requirements using {python_venv_exe} -m pip...")
    run_command(f"{python_venv_exe} -m pip install --upgrade pip")
    run_command(f"{python_venv_exe} -m pip install -r requirements.txt", cwd=BACKEND_DIR)

def pull_ssm_parameters(venv_dir):
    """Pulls parameters from AWS SSM and creates .env files by running a script in the venv."""
    print(f"☁️  Fetching AWS SSM parameters from {SSM_PREFIX}...")
    
    if os.name == "nt":
        python_venv_exe = venv_dir / "Scripts" / "python.exe"
    else:
        python_venv_exe = venv_dir / "bin" / "python"

    # We'll run a small inline script using the venv's python so it can find boto3
    fetch_script = f"""
import boto3
import sys
from pathlib import Path

prefix = "{SSM_PREFIX}"
try:
    session = boto3.Session(profile_name='dev')
    ssm = session.client('ssm')
    
    params = []
    paginator = ssm.get_paginator('get_parameters_by_path')
    for page in paginator.paginate(Path=prefix, WithDecryption=True):
        params.extend(page['Parameters'])
        
    # Also fetch the global Cognito parameters
    global_names = [
        "/axiorapulse/COGNITO_USER_POOL_ID", 
        "/axiorapulse/COGNITO_APP_CLIENT_ID", 
        "/axiorapulse/COGNITO_REGION"
    ]
    try:
        resp = ssm.get_parameters(Names=global_names, WithDecryption=True)
        params.extend(resp.get('Parameters', []))
    except Exception as e:
        print(f"WARNING: Global Cognito fetch failed: {{e}}")
    
    print(f"FOUND:{{len(params)}}")
    for p in params:
        name = p['Name'].replace(prefix, "").replace("/axiorapulse/", "")
        value = p['Value']
        print(f"PARAM:{{name}}={{value}}")
        
except Exception as e:
    print(f"ERROR:{{e}}")
    sys.exit(1)
"""
    
    # Ensure boto3 is installed in the venv first
    if os.name == "nt":
        pip_path = venv_dir / "Scripts" / "pip.exe"
    else:
        pip_path = venv_dir / "bin" / "pip"
        if not pip_path.exists():
            pip_path = venv_dir / "bin" / "pip3"
    
    run_command(f"{pip_path} install boto3")

    # Run the fetcher
    result = subprocess.run(
        [str(python_venv_exe), "-c", fetch_script],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"❌ Error pulling SSM parameters: {result.stdout} {result.stderr}")
        sys.exit(1)

    output_lines = result.stdout.splitlines()
    params_dict = {}
    for line in output_lines:
        if line.startswith("PARAM:"):
            key, val = line[6:].split("=", 1)
            params_dict[key] = val
        elif line.startswith("FOUND:"):
            print(f"✨ Found {line[6:]} parameters.")
        elif line.startswith("ERROR:"):
            print(f"❌ AWS Error: {line[6:]}")
            sys.exit(1)

    backend_env = BACKEND_DIR / ".env"
    frontend_env = FRONTEND_DIR / ".env"
    
    with open(backend_env, "w") as be_f, open(frontend_env, "w") as fe_f:
        be_f.write(f"# Auto-generated from SSM {SSM_PREFIX}\n")
        fe_f.write(f"# Auto-generated from SSM {SSM_PREFIX}\n")
        
        # Ensure we always have Vite base URL
        fe_f.write("VITE_API_BASE_URL=http://localhost:8000\n")
        
        for name, value in params_dict.items():
            line = f"{name}={value}\n"
            be_f.write(line)
            
            # Map Cognito parameters to VITE_ prefix for frontend, alongside other VITE_ variables
            if name.startswith("VITE_"):
                fe_f.write(line)
            elif name in ["COGNITO_USER_POOL_ID", "COGNITO_APP_CLIENT_ID", "COGNITO_REGION"]:
                fe_f.write(f"VITE_{name}={value}\n")

def setup_frontend():
    """Installs frontend dependencies."""
    print("🎨 Installing frontend dependencies...")
    if shutil.which("npm") is None:
        print("❌ Error: 'npm' not found. Please install Node.js.")
        sys.exit(1)
    
    run_command("npm install", cwd=FRONTEND_DIR)

def start_services(target="both"):
    """Starts backend, frontend, or both services."""
    processes = []
    
    # Define absolute paths for reliability
    abs_venv_dir = VENV_DIR.resolve()
    
    # Use different activation/executable logic for Windows vs Unix
    if os.name == "nt":
        # Windows: Use the python.exe directly from the venv to run uvicorn
        # This is more robust than trying to 'activate' in a subprocess
        backend_python = abs_venv_dir / "Scripts" / "python.exe"
        backend_cmd = f'"{backend_python}" -m uvicorn app.main:app --reload --port 8000'
        frontend_cmd = "npm.cmd run dev" # npm is often npm.cmd on Windows
    else:
        # Unix
        activate_script = abs_venv_dir / "bin" / "activate"
        backend_cmd = f"source {activate_script} && uvicorn app.main:app --reload --port 8000"
        frontend_cmd = "npm run dev"

    print(f"\n🔥 Starting services (Target: {target})...")

    try:
        if target in ["backend", "both"]:
            print("🖥️  Launching Backend...")
            # Use bash on unix, default shell on windows
            shell_exec = "/bin/bash" if os.name != "nt" else None
            p_be = subprocess.Popen(backend_cmd, cwd=BACKEND_DIR, shell=True, executable=shell_exec)
            processes.append(p_be)

        if target in ["frontend", "both"]:
            print("🌐 Launching Frontend...")
            p_fe = subprocess.Popen(frontend_cmd, cwd=FRONTEND_DIR, shell=True)
            processes.append(p_fe)

        if not processes:
            print("❓ No services selected to start.")
            return

        print("\n" + "✨"*20)
        print("🎉 Services are running!")
        print("💡 Press Ctrl+C to stop all services.")
        print("✨"*20 + "\n")

        # Wait for processes to finish (or be interrupted)
        for p in processes:
            p.wait()

    except KeyboardInterrupt:
        print("\n🛑 Stopping all services...")
        for p in processes:
            p.terminate()
        print("✅ All services stopped.")

def main():
    import argparse
    parser = argparse.ArgumentParser(description="AxioraPulse Development Orchestrator")
    parser.add_argument("command", nargs="?", default="both", choices=["backend", "frontend", "both", "setup"], 
                        help="Choose to start backend, frontend, both, or just run setup.")
    parser.add_argument("--force", action="store_true", help="Force a full setup even if environment exists.")
    args = parser.parse_args()

    os_name = detect_os()
    
    # Check if we need setup
    backend_env = BACKEND_DIR / ".env"
    frontend_env = FRONTEND_DIR / ".env"
    abs_venv_dir = VENV_DIR.resolve()
    
    needs_setup = args.command == "setup" or args.force or \
                  not backend_env.exists() or not frontend_env.exists() or \
                  not abs_venv_dir.exists()

    if needs_setup:
        print("🛠️  Environment setup required or requested...")
        python_exe = setup_python()
        clean_and_setup_venv(python_exe)
        # We need boto3 in the venv to pull SSM
        pull_ssm_parameters(abs_venv_dir)
        setup_frontend()
        
        if args.command == "setup":
            print("\n✅ Setup complete! You can now run: ./dev.sh backend | frontend | both")
            return
    else:
        print("🚀 Environment already configured. Skipping setup steps...")
        print("💡 Use './dev.sh setup' if you need to refresh secrets or dependencies.")

    # Start the requested services
    if args.command != "setup":
        start_services(args.command)

if __name__ == "__main__":
    main()
