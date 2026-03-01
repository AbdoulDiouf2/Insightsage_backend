"""Database connection and query execution for Sage SQL Server"""

import time
from typing import Any, Dict, List, Optional, Tuple
from contextlib import contextmanager
import pyodbc
from loguru import logger

from .config import SageConfig
from .security import SQLValidator, SQLSecurityError


class DatabaseError(Exception):
    """Raised when database operations fail"""
    pass


class SageDatabase:
    """Manages connection to Sage SQL Server database"""
    
    def __init__(self, config: SageConfig, validator: SQLValidator, timeout: int = 5):
        self.config = config
        self.validator = validator
        self.timeout = timeout
        self._connection_string = self._build_connection_string()
        logger.info(f"SageDatabase initialized for {config.type} on {config.host}:{config.port}")
    
    def _build_connection_string(self) -> str:
        """Build ODBC connection string"""
        return (
            f"DRIVER={{{self.config.driver}}};"
            f"SERVER={self.config.host},{self.config.port};"
            f"DATABASE={self.config.database};"
            f"UID={self.config.username};"
            f"PWD={self.config.password};"
            f"TrustServerCertificate=yes;"
            f"Connection Timeout={self.timeout};"
        )
    
    @contextmanager
    def get_connection(self):
        """Context manager for database connections"""
        conn = None
        try:
            conn = pyodbc.connect(self._connection_string, timeout=self.timeout)
            conn.timeout = self.timeout
            yield conn
        except pyodbc.Error as e:
            logger.error(f"Database connection error: {e}")
            raise DatabaseError(f"Failed to connect to Sage database: {e}")
        finally:
            if conn:
                conn.close()
    
    def test_connection(self) -> Tuple[bool, str]:
        """Test database connectivity"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                return True, "Connection successful"
        except Exception as e:
            return False, str(e)
    
    def execute_query(self, sql: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Execute a validated SQL query and return results as JSON.
        
        Args:
            sql: SQL query string
            params: Optional parameters for parameterized queries
            
        Returns:
            Dict with 'result' (list of rows) and 'metadata'
        """
        start_time = time.time()
        
        # Validate SQL
        is_valid, result = self.validator.validate(sql)
        if not is_valid:
            raise SQLSecurityError(result)
        
        sanitized_sql = result
        logger.debug(f"Executing query: {sanitized_sql[:100]}...")
        
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(sanitized_sql)
                
                # Get column names
                columns = [column[0] for column in cursor.description]
                
                # Fetch all rows
                rows = cursor.fetchall()
                
                # Convert to list of dicts
                result_data = [
                    {columns[i]: self._serialize_value(row[i]) for i in range(len(columns))}
                    for row in rows
                ]
                
                exec_time = int((time.time() - start_time) * 1000)
                
                logger.info(f"Query executed: {len(result_data)} rows in {exec_time}ms")
                
                return {
                    "result": result_data,
                    "metadata": {
                        "rows": len(result_data),
                        "columns": columns,
                        "exec_time_ms": exec_time
                    }
                }
                
        except pyodbc.Error as e:
            logger.error(f"Query execution error: {e}")
            raise DatabaseError(f"Query execution failed: {e}")
    
    def _serialize_value(self, value: Any) -> Any:
        """Convert database values to JSON-serializable format"""
        if value is None:
            return None
        if isinstance(value, (int, float, str, bool)):
            return value
        if hasattr(value, 'isoformat'):  # datetime
            return value.isoformat()
        if isinstance(value, bytes):
            return value.hex()
        return str(value)
    
    def get_table_info(self, table_name: str) -> Dict[str, Any]:
        """Get information about a table (for debugging)"""
        sql = f"""
            SELECT TOP 1 *
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = '{table_name}'
        """
        # This query is for internal use, bypass validator
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(sql)
                return {"exists": cursor.fetchone() is not None}
        except Exception as e:
            return {"exists": False, "error": str(e)}
