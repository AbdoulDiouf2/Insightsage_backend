"""Configuration management for InsightSage Agent"""

import os
import yaml
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
from loguru import logger


class SageConfig(BaseModel):
    """Sage SQL Server connection configuration"""
    host: str = "localhost"
    port: int = 1433
    database: str
    username: str
    password: str
    driver: str = "ODBC Driver 17 for SQL Server"
    type: str = "100"  # "X3" or "100"
    version: str = "v12"


class BackendConfig(BaseModel):
    """InsightSage Backend SaaS configuration"""
    url: str = "https://api.insightsage.com"
    agent_token: str
    heartbeat_interval: int = 30


class SecurityConfig(BaseModel):
    """Security settings"""
    allowed_tables: List[str] = Field(default_factory=list)
    max_rows: int = 1000
    query_timeout: int = 5
    rate_limit: int = 10


class AgentConfig(BaseModel):
    """Agent settings"""
    name: str = "InsightSage-Agent"
    port: int = 8080
    log_level: str = "INFO"
    log_dir: str = "./logs"


class Config(BaseModel):
    """Main configuration"""
    sage: SageConfig
    backend: BackendConfig
    security: SecurityConfig
    agent: AgentConfig


def load_config(config_path: Optional[str] = None) -> Config:
    """Load configuration from YAML file"""
    if config_path is None:
        # Look for config in standard locations
        possible_paths = [
            Path("./config.yaml"),
            Path("./config/config.yaml"),
            Path(os.path.expanduser("~/.insightsage/config.yaml")),
            Path("/etc/insightsage/config.yaml"),
        ]
        for path in possible_paths:
            if path.exists():
                config_path = str(path)
                break
        else:
            raise FileNotFoundError(
                "Configuration file not found. "
                "Please create config.yaml from config.example.yaml"
            )
    
    logger.info(f"Loading configuration from {config_path}")
    
    with open(config_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    
    return Config(**data)


# Global config instance
_config: Optional[Config] = None


def get_config() -> Config:
    """Get the global configuration instance"""
    global _config
    if _config is None:
        _config = load_config()
    return _config


def init_config(config_path: Optional[str] = None) -> Config:
    """Initialize configuration"""
    global _config
    _config = load_config(config_path)
    return _config
