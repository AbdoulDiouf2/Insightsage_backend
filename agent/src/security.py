"""SQL Security Validator - Prevents SQL Injection and enforces read-only access"""

import re
from typing import Tuple, List, Set
from loguru import logger


class SQLSecurityError(Exception):
    """Raised when SQL validation fails"""
    pass


class SQLValidator:
    """Validates and sanitizes SQL queries for security"""
    
    # Forbidden SQL keywords (write operations)
    FORBIDDEN_KEYWORDS = {
        "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE",
        "TRUNCATE", "EXEC", "EXECUTE", "GRANT", "REVOKE",
        "MERGE", "CALL", "BULK", "OPENROWSET", "OPENDATASOURCE",
        "XP_", "SP_", "--", ";", "/*"
    }
    
    # Pattern to extract table names from SQL
    TABLE_PATTERN = re.compile(
        r"\bFROM\s+([\w\.\[\]]+)|\bJOIN\s+([\w\.\[\]]+)",
        re.IGNORECASE
    )
    
    def __init__(self, allowed_tables: List[str], max_rows: int = 1000):
        self.allowed_tables = {t.upper() for t in allowed_tables}
        self.max_rows = max_rows
        logger.info(f"SQLValidator initialized with {len(allowed_tables)} allowed tables")
    
    def validate(self, sql: str) -> Tuple[bool, str]:
        """
        Validate SQL query for security.
        
        Returns:
            Tuple of (is_valid, error_message or sanitized_sql)
        """
        if not sql or not sql.strip():
            return False, "Empty SQL query"
        
        sql_upper = sql.upper().strip()
        
        # 1. Must start with SELECT
        if not sql_upper.startswith("SELECT"):
            logger.warning(f"Blocked non-SELECT query: {sql[:50]}...")
            return False, "Only SELECT queries are allowed"
        
        # 2. Check for forbidden keywords
        for keyword in self.FORBIDDEN_KEYWORDS:
            if keyword in sql_upper:
                logger.warning(f"Blocked query with forbidden keyword '{keyword}'")
                return False, f"Forbidden keyword detected: {keyword}"
        
        # 3. Check for multiple statements (;)
        if ";" in sql and not sql.strip().endswith(";"):
            logger.warning("Blocked query with multiple statements")
            return False, "Multiple SQL statements are not allowed"
        
        # 4. Extract and validate table names
        tables = self._extract_tables(sql)
        invalid_tables = tables - self.allowed_tables
        if invalid_tables:
            logger.warning(f"Blocked query with unauthorized tables: {invalid_tables}")
            return False, f"Unauthorized tables: {', '.join(invalid_tables)}"
        
        # 5. Add TOP clause if not present
        sanitized_sql = self._ensure_top_clause(sql)
        
        logger.debug(f"Query validated successfully")
        return True, sanitized_sql
    
    def _extract_tables(self, sql: str) -> Set[str]:
        """Extract table names from SQL query"""
        tables = set()
        matches = self.TABLE_PATTERN.findall(sql)
        
        for match in matches:
            for table in match:
                if table:
                    # Clean table name (remove brackets, schema prefix)
                    clean_name = table.replace("[", "").replace("]", "")
                    # Remove schema prefix if present (e.g., dbo.F_COMPTET -> F_COMPTET)
                    if "." in clean_name:
                        clean_name = clean_name.split(".")[-1]
                    tables.add(clean_name.upper())
        
        return tables
    
    def _ensure_top_clause(self, sql: str) -> str:
        """Add TOP clause if not present to limit results"""
        sql_upper = sql.upper()
        
        # Check if TOP already exists
        if "TOP" in sql_upper:
            # Extract existing TOP value and enforce max
            top_match = re.search(r"TOP\s+(\d+)", sql_upper)
            if top_match:
                existing_top = int(top_match.group(1))
                if existing_top > self.max_rows:
                    # Replace with max_rows
                    sql = re.sub(
                        r"TOP\s+\d+",
                        f"TOP {self.max_rows}",
                        sql,
                        flags=re.IGNORECASE
                    )
            return sql
        
        # Add TOP clause after SELECT
        sql = re.sub(
            r"^(SELECT\s+)(DISTINCT\s+)?",
            rf"\1\2TOP {self.max_rows} ",
            sql,
            flags=re.IGNORECASE
        )
        
        return sql


def create_validator(allowed_tables: List[str], max_rows: int = 1000) -> SQLValidator:
    """Factory function to create a SQL validator"""
    return SQLValidator(allowed_tables, max_rows)
