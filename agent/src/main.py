"""InsightSage Agent - Main Entry Point"""

import sys
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from loguru import logger

from .config import init_config, Config
from .security import SQLValidator
from .database import SageDatabase
from .heartbeat import HeartbeatService
from .api.routes import router, set_dependencies, limiter


def setup_logging(config: Config):
    """Configure logging"""
    log_dir = Path(config.agent.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Remove default handler
    logger.remove()
    
    # Console handler
    logger.add(
        sys.stdout,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
        level=config.agent.log_level
    )
    
    # File handler with rotation
    logger.add(
        log_dir / "agent_{time:YYYY-MM-DD}.log",
        rotation="1 day",
        retention="30 days",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function} - {message}",
        level="DEBUG"
    )
    
    logger.info(f"Logging configured. Level: {config.agent.log_level}")


def create_app(config_path: str = None) -> FastAPI:
    """Create and configure FastAPI application"""
    
    # Load configuration
    config = init_config(config_path)
    setup_logging(config)
    
    logger.info("="*50)
    logger.info("InsightSage Agent Starting...")
    logger.info("="*50)
    
    # Create SQL validator
    validator = SQLValidator(
        allowed_tables=config.security.allowed_tables,
        max_rows=config.security.max_rows
    )
    
    # Create database connection
    database = SageDatabase(
        config=config.sage,
        validator=validator,
        timeout=config.security.query_timeout
    )
    
    # Create heartbeat service
    heartbeat = HeartbeatService(
        backend_config=config.backend,
        agent_config=config.agent,
        sage_config=config.sage
    )
    
    # Set dependencies for routes
    set_dependencies(database, heartbeat, config)
    
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Application lifespan events"""
        # Startup
        logger.info("Starting agent services...")
        
        # Test Sage connection
        sage_ok, sage_msg = database.test_connection()
        if sage_ok:
            logger.info(f"✅ Sage connection: OK")
        else:
            logger.warning(f"⚠️ Sage connection failed: {sage_msg}")
        
        # Start heartbeat
        heartbeat.start()
        
        # Initial registration attempt
        asyncio.create_task(heartbeat.register())
        
        logger.info(f"🚀 Agent ready on port {config.agent.port}")
        
        yield
        
        # Shutdown
        logger.info("Shutting down agent services...")
        heartbeat.stop()
        logger.info("Agent stopped.")
    
    # Create FastAPI app
    app = FastAPI(
        title="InsightSage Agent",
        description="Secure On-Premise Sage Connector for InsightSage SaaS Platform",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc"
    )
    
    # Add rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    
    # CORS (only allow local access by default)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost", "http://127.0.0.1"],
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    
    # Include routes
    app.include_router(router, prefix="")
    
    return app


def main():
    """Main entry point for running the agent"""
    import argparse
    
    parser = argparse.ArgumentParser(description="InsightSage Agent")
    parser.add_argument(
        "-c", "--config",
        help="Path to configuration file",
        default=None
    )
    parser.add_argument(
        "-p", "--port",
        help="Port to run on (overrides config)",
        type=int,
        default=None
    )
    
    args = parser.parse_args()
    
    # Create app
    app = create_app(args.config)
    
    # Get port from config or args
    from .config import get_config
    config = get_config()
    port = args.port or config.agent.port
    
    # Run server
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )


if __name__ == "__main__":
    main()
