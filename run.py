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
        for line in process.stdout:
            print(line, end="")
        process.wait()
        return process.returncode
    except KeyboardInterrupt:
        print("\n\033[93mShutting down process...\033[0m")
        return 0

def setup_backend(force_clean=False):
    print("\n\033[94m--- Setting up Backend ---\033[0m")
    backend_dir = os.path.join(os.getcwd(), "backend")
    venv_dir = os.path.join(backend_dir, ".venv")
    
    # Path to pip/python inside venv
    if platform.system() == "Windows":
        pip_path = os.path.join(venv_dir, "Scripts", "pip.exe")
        python_path = os.path.join(venv_dir, "Scripts", "python.exe")
        uvicorn_path = os.path.join(venv_dir, "Scripts", "uvicorn.exe")
    else:
        pip_path = os.path.join(venv_dir, "bin", "pip")
        python_path = os.path.join(venv_dir, "bin", "python")
        uvicorn_path = os.path.join(venv_dir, "bin", "uvicorn")

    # Check for version mismatch if venv exists
    if os.path.exists(venv_dir):
        try:
            # Check the python version inside the venv
            venv_version_out = subprocess.check_output([python_path, "--version"], text=True).strip()
            if "3.11" not in venv_version_out:
                print(f"\033[93mVersion mismatch detected in venv ({venv_version_out}). Cleaning up...\033[0m")
                force_clean = True
        except Exception:
            print("\033[93mCorrupted or incompatible venv detected. Cleaning up...\033[0m")
            force_clean = True

    # Forced cleanup if requested or mismatch found
    if force_clean and os.path.exists(venv_dir):
        print(f"Deleting existing virtual environment in {venv_dir}...")
        shutil.rmtree(venv_dir)

    # Create venv if it doesn't exist
    if not os.path.exists(venv_dir):
        print(f"Creating virtual environment in {venv_dir}...")
        subprocess.run([sys.executable, "-m", "venv", venv_dir], check=True)

    # Install requirements
    print("Installing requirements...")
    subprocess.run([pip_path, "install", "--upgrade", "pip"], check=True)
    subprocess.run([pip_path, "install", "-r", os.path.join(backend_dir, "requirements.txt")], check=True)
    
    return uvicorn_path, backend_dir

def run_backend(force_clean=False):
    uvicorn_path, backend_dir = setup_backend(force_clean=force_clean)
    print("\n\033[94m--- Starting Backend (FastAPI) ---\033[0m")
    run_command(f"\"{uvicorn_path}\" app.main:app --reload --host 0.0.0.0 --port 8000", cwd=backend_dir)

def run_frontend(force_clean=False):
    print("\n\033[95m--- Starting Frontend (Vite) ---\033[0m")
    frontend_dir = os.path.join(os.getcwd(), "frontend")
    node_modules_dir = os.path.join(frontend_dir, "node_modules")

    if force_clean and os.path.exists(node_modules_dir):
        print(f"Deleting existing node_modules in {node_modules_dir}...")
        shutil.rmtree(node_modules_dir)
    
    if not os.path.exists(node_modules_dir):
        print("Installing npm dependencies...")
        subprocess.run("npm install", cwd=frontend_dir, shell=True, check=True)
    
    run_command("npm run dev", cwd=frontend_dir)

def main():
    parser = argparse.ArgumentParser(description="AxioraPulse Developer Orchestrator")
    parser.add_argument("module", choices=["backend", "frontend", "both"], help="Module to run")
    parser.add_argument("--clean", "-c", action="store_true", help="Force cleanup of virtual environment or node_modules before running")
    args = parser.parse_args()

    check_python_version()

    try:
        if args.module == "backend":
            run_backend(force_clean=args.clean)
        elif args.module == "frontend":
            run_frontend(force_clean=args.clean)
        elif args.module == "both":
            print("\033[93mNote: Running both requires two terminal sessions usually. Starting sequentially...\033[0m")
            run_backend(force_clean=args.clean)
    except Exception as e:
        print(f"\033[91mError: {e}\033[0m")
        sys.exit(1)

if __name__ == "__main__":
    main()
