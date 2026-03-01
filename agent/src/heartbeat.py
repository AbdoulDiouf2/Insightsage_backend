"""Heartbeat service for communication with InsightSage Backend"""

import asyncio
from typing import Optional, Dict, Any
import httpx
from loguru import logger
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .config import BackendConfig, AgentConfig, SageConfig


class HeartbeatService:
    """Manages heartbeat communication with InsightSage Backend"""
    
    def __init__(
        self,
        backend_config: BackendConfig,
        agent_config: AgentConfig,
        sage_config: SageConfig
    ):
        self.backend_url = backend_config.url.rstrip("/")
        self.agent_token = backend_config.agent_token
        self.interval = backend_config.heartbeat_interval
        self.agent_name = agent_config.name
        self.sage_type = sage_config.type
        self.sage_version = sage_config.version
        
        self.scheduler: Optional[AsyncIOScheduler] = None
        self.is_registered = False
        self.organization_id: Optional[str] = None
        self.last_heartbeat_status: Optional[str] = None
        self.error_count = 0
        
        logger.info(f"HeartbeatService initialized for {self.backend_url}")
    
    async def register(self) -> Dict[str, Any]:
        """Register agent with the backend"""
        url = f"{self.backend_url}/api/agents/register"
        
        payload = {
            "agent_token": self.agent_token,
            "sage_type": self.sage_type,
            "sage_version": self.sage_version,
            "agent_name": self.agent_name
        }
        
        logger.info(f"Registering agent with backend: {url}")
        
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(url, json=payload)
                
                if response.status_code == 200 or response.status_code == 201:
                    data = response.json()
                    self.is_registered = True
                    self.organization_id = data.get("organization_id")
                    logger.info(f"Agent registered successfully. Org: {self.organization_id}")
                    return {"success": True, "data": data}
                else:
                    logger.error(f"Registration failed: {response.status_code} - {response.text}")
                    return {"success": False, "error": response.text}
                    
        except httpx.RequestError as e:
            logger.error(f"Registration request failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def send_heartbeat(self) -> None:
        """Send heartbeat to backend"""
        if not self.is_registered:
            logger.warning("Agent not registered, attempting registration...")
            result = await self.register()
            if not result.get("success"):
                self.error_count += 1
                return
        
        url = f"{self.backend_url}/api/agent/heartbeat"
        
        payload = {
            "organizationId": self.organization_id,
            "agentToken": self.agent_token,
            "agentVersion": "1.0.0",
            "status": "online",
            "errorCount": self.error_count
        }
        
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={"Authorization": f"Bearer {self.agent_token}"}
                )
                
                if response.status_code == 200:
                    self.last_heartbeat_status = "ok"
                    self.error_count = 0
                    logger.debug("Heartbeat sent successfully")
                else:
                    self.last_heartbeat_status = "error"
                    self.error_count += 1
                    logger.warning(f"Heartbeat failed: {response.status_code}")
                    
        except httpx.RequestError as e:
            self.last_heartbeat_status = "error"
            self.error_count += 1
            logger.error(f"Heartbeat request failed: {e}")
    
    def start(self) -> None:
        """Start the heartbeat scheduler"""
        if self.scheduler is not None:
            logger.warning("Heartbeat scheduler already running")
            return
        
        self.scheduler = AsyncIOScheduler()
        self.scheduler.add_job(
            self.send_heartbeat,
            'interval',
            seconds=self.interval,
            id='heartbeat_job',
            replace_existing=True
        )
        self.scheduler.start()
        logger.info(f"Heartbeat scheduler started (interval: {self.interval}s)")
    
    def stop(self) -> None:
        """Stop the heartbeat scheduler"""
        if self.scheduler:
            self.scheduler.shutdown()
            self.scheduler = None
            logger.info("Heartbeat scheduler stopped")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current heartbeat status"""
        return {
            "is_registered": self.is_registered,
            "organization_id": self.organization_id,
            "last_status": self.last_heartbeat_status,
            "error_count": self.error_count,
            "scheduler_running": self.scheduler is not None and self.scheduler.running
        }
