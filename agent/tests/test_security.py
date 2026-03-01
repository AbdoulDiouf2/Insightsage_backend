"""Tests for SQL Security Validator"""

import pytest
from src.security import SQLValidator, SQLSecurityError


@pytest.fixture
def validator():
    """Create a validator with test tables"""
    return SQLValidator(
        allowed_tables=["F_DOCENTETE", "F_COMPTET", "F_ECRITUREC"],
        max_rows=1000
    )


class TestSQLValidator:
    
    def test_valid_select_query(self, validator):
        """Test that valid SELECT queries pass"""
        sql = "SELECT * FROM F_DOCENTETE WHERE DO_Type = 1"
        is_valid, result = validator.validate(sql)
        assert is_valid
        assert "TOP 1000" in result
    
    def test_reject_insert_query(self, validator):
        """Test that INSERT queries are rejected"""
        sql = "INSERT INTO F_DOCENTETE (DO_Type) VALUES (1)"
        is_valid, error = validator.validate(sql)
        assert not is_valid
        assert "SELECT" in error
    
    def test_reject_update_query(self, validator):
        """Test that UPDATE queries are rejected"""
        sql = "UPDATE F_DOCENTETE SET DO_Type = 2 WHERE DO_Piece = 'FA001'"
        is_valid, error = validator.validate(sql)
        assert not is_valid
    
    def test_reject_delete_query(self, validator):
        """Test that DELETE queries are rejected"""
        sql = "DELETE FROM F_DOCENTETE WHERE DO_Piece = 'FA001'"
        is_valid, error = validator.validate(sql)
        assert not is_valid
    
    def test_reject_drop_query(self, validator):
        """Test that DROP queries are rejected"""
        sql = "DROP TABLE F_DOCENTETE"
        is_valid, error = validator.validate(sql)
        assert not is_valid
    
    def test_reject_unauthorized_table(self, validator):
        """Test that queries on unauthorized tables are rejected"""
        sql = "SELECT * FROM F_ARTICLE"
        is_valid, error = validator.validate(sql)
        assert not is_valid
        assert "Unauthorized" in error
    
    def test_reject_sql_injection_semicolon(self, validator):
        """Test that SQL injection with semicolon is rejected"""
        sql = "SELECT * FROM F_DOCENTETE; DROP TABLE F_COMPTET"
        is_valid, error = validator.validate(sql)
        assert not is_valid
    
    def test_reject_sql_injection_comment(self, validator):
        """Test that SQL injection with comments is rejected"""
        sql = "SELECT * FROM F_DOCENTETE -- WHERE DO_Type = 1"
        is_valid, error = validator.validate(sql)
        assert not is_valid
    
    def test_add_top_clause_if_missing(self, validator):
        """Test that TOP clause is added if missing"""
        sql = "SELECT * FROM F_DOCENTETE"
        is_valid, result = validator.validate(sql)
        assert is_valid
        assert "TOP 1000" in result.upper()
    
    def test_preserve_existing_top_clause(self, validator):
        """Test that existing TOP clause is preserved if <= max_rows"""
        sql = "SELECT TOP 100 * FROM F_DOCENTETE"
        is_valid, result = validator.validate(sql)
        assert is_valid
        assert "TOP 100" in result.upper()
    
    def test_reduce_excessive_top_clause(self, validator):
        """Test that excessive TOP clause is reduced to max_rows"""
        sql = "SELECT TOP 5000 * FROM F_DOCENTETE"
        is_valid, result = validator.validate(sql)
        assert is_valid
        assert "TOP 1000" in result.upper()
    
    def test_handle_join_queries(self, validator):
        """Test that JOIN queries with allowed tables pass"""
        sql = """
            SELECT d.*, c.CT_Intitule 
            FROM F_DOCENTETE d
            JOIN F_COMPTET c ON d.DO_Tiers = c.CT_Num
        """
        is_valid, result = validator.validate(sql)
        assert is_valid
    
    def test_reject_join_with_unauthorized_table(self, validator):
        """Test that JOIN with unauthorized table is rejected"""
        sql = """
            SELECT d.*, a.AR_Design 
            FROM F_DOCENTETE d
            JOIN F_ARTICLE a ON d.AR_Ref = a.AR_Ref
        """
        is_valid, error = validator.validate(sql)
        assert not is_valid
        assert "Unauthorized" in error or "F_ARTICLE" in error
    
    def test_empty_query(self, validator):
        """Test that empty query is rejected"""
        is_valid, error = validator.validate("")
        assert not is_valid
        assert "Empty" in error
    
    def test_whitespace_query(self, validator):
        """Test that whitespace-only query is rejected"""
        is_valid, error = validator.validate("   ")
        assert not is_valid


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
