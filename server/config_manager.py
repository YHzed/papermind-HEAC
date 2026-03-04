import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent.parent
CONFIG_PATH = BASE_DIR / "config.yaml"
ENV_PATH = BASE_DIR / ".env"

load_dotenv(ENV_PATH)


def load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}
    return config


def save_config(config: dict):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.dump(config, f, allow_unicode=True, default_flow_style=False, sort_keys=False)


def get_api_key(provider: str) -> str:
    """获取 API Key，.env 优先级高于 config.yaml"""
    env_map = {"mistral": "MISTRAL_API_KEY", "openai": "OPENAI_API_KEY"}
    env_val = os.environ.get(env_map.get(provider, ""))
    if env_val:
        return env_val
    config = load_config()
    return config.get("api_keys", {}).get(provider, "")


def get_llm_settings() -> dict:
    config = load_config()
    return config.get("llm", {})


def get_system_prompt() -> str:
    config = load_config()
    return config.get("system_prompt", "")


def get_templates() -> list:
    config = load_config()
    return config.get("templates", [])


def get_workflows() -> list:
    config = load_config()
    return config.get("workflows", [])


def mask_key(key: str) -> str:
    """隐藏 API key 中间部分"""
    if not key or len(key) < 8:
        return key
    return key[:4] + "*" * (len(key) - 8) + key[-4:]
