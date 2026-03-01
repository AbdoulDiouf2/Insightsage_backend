"""API Routes for InsightSage Agent"""

from datetime import datetime
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from loguru import logger


# Rate limiter
limiter = Limiter(key_func=get_remote_address)

router = APIRouter()


# Request/Response Models
class ExecuteSQLRequest(BaseModel):
    """Request body for SQL execution"""
    sql_query: str = Field(..., description="SQL SELECT query to execute")
    params: Optional[Dict[str, Any]] = Field(default=None, description="Query parameters")


class ExecuteSQLResponse(BaseModel):
    """Response body for SQL execution"""
    result: list
    metadata: Dict[str, Any]


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    agent_name: str
    version: str
    timestamp: str
    sage_connected: bool
    backend_registered: bool


class ErrorResponse(BaseModel):
    """Error response"""
    error: str
    code: str
    timestamp: str


# Dependency injection placeholders (set by main.py)
_database = None
_heartbeat = None
_config = None


def set_dependencies(database, heartbeat, config):
    """Set module dependencies"""
    global _database, _heartbeat, _config
    _database = database
    _heartbeat = heartbeat
    _config = config


def get_database():
    """Get database instance"""
    if _database is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
    return _database


def get_heartbeat():
    """Get heartbeat service instance"""
    if _heartbeat is None:
        raise HTTPException(status_code=500, detail="Heartbeat service not initialized")
    return _heartbeat


def get_config():
    """Get config instance"""
    if _config is None:
        raise HTTPException(status_code=500, detail="Config not initialized")
    return _config


@router.get("/ping", response_model=HealthResponse, tags=["Health"])
async def ping(
    database = Depends(get_database),
    heartbeat = Depends(get_heartbeat),
    config = Depends(get_config)
):
    """
    Health check endpoint.
    Returns agent status and connectivity information.
    """
    # Test Sage connection
    sage_ok, _ = database.test_connection()
    
    # Get heartbeat status
    hb_status = heartbeat.get_status()
    
    return HealthResponse(
        status="ok",
        agent_name=config.agent.name,
        version="1.0.0",
        timestamp=datetime.utcnow().isoformat(),
        sage_connected=sage_ok,
        backend_registered=hb_status["is_registered"]
    )


@router.get("/health", tags=["Health"])
async def health():
    """Simple health check for load balancers"""
    return {"status": "ok"}


@router.post(
    "/execute_sql",
    response_model=ExecuteSQLResponse,
    responses={400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
    tags=["Query"]
)
@limiter.limit("10/minute")
async def execute_sql(
    request: Request,
    body: ExecuteSQLRequest,
    database = Depends(get_database)
):
    """
    Execute a SQL SELECT query on Sage database.
    
    Security:
    - Only SELECT queries are allowed
    - Tables must be in the whitelist
    - Results limited to 1000 rows max
    - Rate limited to 10 requests/minute
    - Query timeout: 5 seconds
    """
    from ..security import SQLSecurityError
    from ..database import DatabaseError
    
    logger.info(f"Received SQL query request from {request.client.host}")
    
    try:
        result = database.execute_query(body.sql_query, body.params)
        return ExecuteSQLResponse(**result)
        
    except SQLSecurityError as e:
        logger.warning(f"Security violation: {e}")
        raise HTTPException(
            status_code=403,
            detail={"error": str(e), "code": "SECURITY_VIOLATION", "timestamp": datetime.utcnow().isoformat()}
        )
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        raise HTTPException(
            status_code=400,
            detail={"error": str(e), "code": "DATABASE_ERROR", "timestamp": datetime.utcnow().isoformat()}
        )
    except Exception as e:
        logger.exception(f"Unexpected error: {e}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Internal server error", "code": "INTERNAL_ERROR", "timestamp": datetime.utcnow().isoformat()}
        )


@router.get("/status", tags=["Status"])
async def get_status(
    database = Depends(get_database),
    heartbeat = Depends(get_heartbeat),
    config = Depends(get_config)
):
    """
    Get detailed agent status.
    """
    sage_ok, sage_msg = database.test_connection()
    hb_status = heartbeat.get_status()
    
    return {
        "agent": {
            "name": config.agent.name,
            "version": "1.0.0",
            "uptime": "N/A"  # Could track this
        },
        "sage": {
            "connected": sage_ok,
            "message": sage_msg,
            "type": config.sage.type,
            "version": config.sage.version,
            "database": config.sage.database
        },
        "backend": hb_status,
        "security": {
            "allowed_tables": config.security.allowed_tables,
            "max_rows": config.security.max_rows,
            "rate_limit": f"{config.security.rate_limit}/minute"
        }
    }


@router.get("/tables", tags=["Info"])
async def get_allowed_tables(config = Depends(get_config)):
    """Get list of allowed tables for querying"""
    return {
        "allowed_tables": config.security.allowed_tables,
        "count": len(config.security.allowed_tables)
    }
