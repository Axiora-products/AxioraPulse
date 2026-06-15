"""
Install offline model packages used by survey translation.

Run this once during local setup or bake it into the backend image:
  python tools/install_offline_translation_models.py

The download step needs internet access, but runtime survey translation is local
after the packages are installed.
"""

from __future__ import annotations

import sys


REQUIRED_PAIRS = (("en", "hi"), ("en", "te"))
NLLB_MODEL = "facebook/nllb-200-distilled-600M"


def main() -> int:
    try:
        import argostranslate.package as package
        import argostranslate.translate as translate
    except ImportError:
        print("argostranslate is not installed. Run: pip install -r requirements.txt", file=sys.stderr)
        return 1

    package.update_package_index()
    available_packages = package.get_available_packages()
    installed_languages = translate.get_installed_languages()

    def is_installed(from_code: str, to_code: str) -> bool:
        for language in installed_languages:
            if language.code != from_code:
                continue
            for translation in language.translations_from:
                if translation.to_lang.code == to_code:
                    return True
        return False

    for from_code, to_code in REQUIRED_PAIRS:
        if is_installed(from_code, to_code):
            print(f"Argos model {from_code}->{to_code} is already installed.")
            continue

        model = next(
            (
                candidate
                for candidate in available_packages
                if candidate.from_code == from_code and candidate.to_code == to_code
            ),
            None,
        )
        if model is None:
            print(f"No Argos package found for {from_code}->{to_code}; NLLB fallback will be used.")
            continue

        print(f"Downloading and installing Argos model {from_code}->{to_code}...")
        package.install_from_path(model.download())

    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    except ImportError:
        print("transformers is not installed. Run: pip install -r requirements.txt", file=sys.stderr)
        return 1

    print(f"Downloading/caching NLLB model {NLLB_MODEL}...")
    AutoTokenizer.from_pretrained(NLLB_MODEL)
    AutoModelForSeq2SeqLM.from_pretrained(NLLB_MODEL)

    print("Offline translation models are ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
