import os
import sys
import subprocess
import platform
import argparse
import shutil

def check_python_version():
    """Ensure we are running on Python 3.11.x."""
    major, minor = sys.version_info[:2]
    if major != 3 or minor != 11:
        print(f"\033[91mERROR: Python version 3.11 is required. Found {major}.{minor}.\033[0m")
        print("Using Python 3.12 or 3.14 will cause dependency errors (e.g., cryptography, pydantic).")
        print("\nPlease install Python 3.11.9 using pyenv:")
        print("  pyenv install 3.11.9")
        print("  pyenv local 3.11.9")
        sys.exit(1)
    print(f"\033[92mSUCCESS: Using Python {sys.version.split()[0]}\033[0m")

def run_command(command, cwd=None, env=None):
    """Run a shell command and stream output."""
    try:
        process = subprocess.Popen(
            command,
            cwd=cwd,
            env=env,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        if process.stdout:
            for line in process.stdout:
                print(line, end="")
        process.wait()
        return process.returncode
    except KeyboardInterrupt:
        print("\n\033[93mShutting down process...\033[0m")
        return 0

def get_backend_paths():
    backend_dir = os.path.join(os.getcwd(), "backend")
    venv_dir = os.path.join(backend_dir, ".venv")
    if platform.system() == "Windows":
        pip_path = os.path.join(venv_dir, "Scripts", "pip.exe")
        python_path = os.path.join(venv_dir, "Scripts", "python.exe")
        uvicorn_path = os.path.join(venv_dir, "Scripts", "uvicorn.exe")
        pytest_path = os.path.join(venv_dir, "Scripts", "pytest.exe")
        ruff_path = os.path.join(venv_dir, "Scripts", "ruff.exe")
    else:
        pip_path = os.path.join(venv_dir, "bin", "pip")
        python_path = os.path.join(venv_dir, "bin", "python")
        uvicorn_path = os.path.join(venv_dir, "bin", "uvicorn")
        pytest_path = os.path.join(venv_dir, "bin", "pytest")
        ruff_path = os.path.join(venv_dir, "bin", "ruff")
    return backend_dir, venv_dir, pip_path, python_path, uvicorn_path, pytest_path, ruff_path

def setup_backend(force_clean=False):
    print("\n\033[94m--- Setting up Backend ---\033[0m")
    backend_dir, venv_dir, pip_path, python_path, _, _, _ = get_backend_paths()

    if os.path.exists(venv_dir):
        try:
            venv_version_out = subprocess.check_output([python_path, "--version"], text=True).strip()
            if "3.11" not in venv_version_out:
                print(f"\033[93mVersion mismatch detected in venv ({venv_version_out}). Cleaning up...\033[0m")
                force_clean = True
        except Exception:
            print("\033[93mCorrupted or incompatible venv detected. Cleaning up...\033[0m")
            force_clean = True

    if force_clean and os.path.exists(venv_dir):
        print(f"Deleting existing virtual environment in {venv_dir}...")
        shutil.rmtree(venv_dir)

    if not os.path.exists(venv_dir):
        print(f"Creating virtual environment in {venv_dir}...")
        subprocess.run([sys.executable, "-m", "venv", venv_dir], check=True)

    print("Installing requirements...")
    subprocess.run([pip_path, "install", "--upgrade", "pip"], check=True)
    subprocess.run([pip_path, "install", "-r", os.path.join(backend_dir, "requirements.txt")], check=True)
    
    return backend_dir

def run_backend(force_clean=False):
    backend_dir = setup_backend(force_clean=force_clean)
    _, _, _, _, uvicorn_path, _, _ = get_backend_paths()
    print("\n\033[94m--- Starting Backend (FastAPI) ---\033[0m")
    run_command(f"\"{uvicorn_path}\" app.main:app --reload --host 0.0.0.0 --port 8000", cwd=backend_dir)

def lint_backend():
    backend_dir = setup_backend()
    _, _, _, _, _, _, ruff_path = get_backend_paths()
    print("\n\033[94m--- Linting Backend (Ruff) ---\033[0m")
    run_command(f"\"{ruff_path}\" check .", cwd=backend_dir)

def format_backend():
    backend_dir = setup_backend()
    _, _, _, _, _, _, ruff_path = get_backend_paths()
    print("\n\033[94m--- Formatting Backend (Ruff) ---\033[0m")
    run_command(f"\"{ruff_path}\" format .", cwd=backend_dir)

def test_backend():
    backend_dir = setup_backend()
    _, _, _, _, _, pytest_path, _ = get_backend_paths()
    print("\n\033[94m--- Running Backend Tests (Pytest) ---\033[0m")
    env = os.environ.copy()
    env["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/postgres"
    env["SECRET_KEY"] = "ci-test-key-32-chars-minimum-length"
    env["COGNITO_USER_POOL_ID"] = "dummy"
    env["COGNITO_APP_CLIENT_ID"] = "dummy"
    env["FRONTEND_URL"] = "http://localhost:3000"
    run_command(f"\"{pytest_path}\"", cwd=backend_dir, env=env)

def setup_frontend(force_clean=False):
    print("\n\033[95m--- Setting up Frontend ---\033[0m")
    frontend_dir = os.path.join(os.getcwd(), "frontend")
    node_modules_dir = os.path.join(frontend_dir, "node_modules")
    package_json = os.path.join(frontend_dir, "package.json")
    package_lock = os.path.join(frontend_dir, "package-lock.json")

    if force_clean and os.path.exists(node_modules_dir):
        print(f"Deleting existing node_modules in {node_modules_dir}...")
        shutil.rmtree(node_modules_dir)
    
    # Check if npm install is needed: missing node_modules or package.json is newer
    needs_install = not os.path.exists(node_modules_dir)
    if not needs_install:
        nm_mtime = os.path.getmtime(node_modules_dir)
        if os.path.getmtime(package_json) > nm_mtime:
            needs_install = True
        elif os.path.exists(package_lock) and os.path.getmtime(package_lock) > nm_mtime:
            needs_install = True

    if needs_install:
        print("Installing npm dependencies...")
        npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"
        subprocess.run([npm_cmd, "install"], cwd=frontend_dir, check=True)
        # Touch node_modules to update mtime
        os.utime(node_modules_dir, None)
    
    return frontend_dir

def run_frontend(force_clean=False):
    frontend_dir = setup_frontend(force_clean=force_clean)
    print("\n\033[95m--- Starting Frontend (Vite) ---\033[0m")
    npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"
    run_command(f"{npm_cmd} run dev", cwd=frontend_dir)

def lint_frontend():
    frontend_dir = setup_frontend()
    print("\n\033[95m--- Linting Frontend (ESLint) ---\033[0m")
    npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"
    run_command(f"{npm_cmd} run lint", cwd=frontend_dir)

def format_frontend():
    frontend_dir = setup_frontend()
    print("\n\033[95m--- Formatting Frontend (Prettier) ---\033[0m")
    npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"
    run_command(f"{npm_cmd} run format", cwd=frontend_dir)

def test_frontend():
    frontend_dir = setup_frontend()
    print("\n\033[95m--- Running Frontend Tests ---\033[0m")
    npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"
    run_command(f"{npm_cmd} test", cwd=frontend_dir)

def main():
    parser = argparse.ArgumentParser(description="AxioraPulse Developer Orchestrator")
    parser.add_argument("action", choices=["run", "lint", "format", "test"], nargs="?", default="run", help="Action to perform")
    parser.add_argument("module", choices=["backend", "frontend", "both"], help="Module to target")
    parser.add_argument("--clean", "-c", action="store_true", help="Force cleanup before running")
    args = parser.parse_args()

    check_python_version()

    try:
        if args.action == "run":
            if args.module == "backend":
                run_backend(force_clean=args.clean)
            elif args.module == "frontend":
                run_frontend(force_clean=args.clean)
            elif args.module == "both":
                print("\033[93mNote: Running both requires two terminal sessions usually. Starting sequentially...\033[0m")
                run_backend(force_clean=args.clean)
        elif args.action == "lint":
            if args.module in ["backend", "both"]:
                lint_backend()
            if args.module in ["frontend", "both"]:
                lint_frontend()
        elif args.action == "format":
            if args.module in ["backend", "both"]:
                format_backend()
            if args.module in ["frontend", "both"]:
                format_frontend()
        elif args.action == "test":
            if args.module in ["backend", "both"]:
                test_backend()
            if args.module in ["frontend", "both"]:
                test_frontend()
    except Exception as e:
        print(f"\033[91mError: {e}\033[0m")
        sys.exit(1)

if __name__ == "__main__":
    main()
