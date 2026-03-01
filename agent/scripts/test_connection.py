"""Quick connection test script"""

import sys
import os

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config import load_config
from src.security import SQLValidator
from src.database import SageDatabase


def main():
    print("="*50)
    print("InsightSage Agent - Test de Connexion")
    print("="*50)
    print()
    
    try:
        # Load config
        print("[1/4] Chargement configuration...")
        config = load_config()
        print(f"      ✅ Configuration chargée")
        print(f"      Sage: {config.sage.type} @ {config.sage.host}:{config.sage.port}")
        print(f"      Database: {config.sage.database}")
        print()
        
        # Create validator
        print("[2/4] Initialisation validateur SQL...")
        validator = SQLValidator(
            allowed_tables=config.security.allowed_tables,
            max_rows=config.security.max_rows
        )
        print(f"      ✅ {len(config.security.allowed_tables)} tables autorisées")
        print()
        
        # Create database connection
        print("[3/4] Connexion à SQL Server...")
        database = SageDatabase(
            config=config.sage,
            validator=validator,
            timeout=config.security.query_timeout
        )
        
        ok, msg = database.test_connection()
        if ok:
            print(f"      ✅ Connexion réussie!")
        else:
            print(f"      ❌ Échec: {msg}")
            return 1
        print()
        
        # Test query
        print("[4/4] Test requête SQL...")
        try:
            result = database.execute_query("SELECT TOP 1 * FROM F_DOCENTETE")
            print(f"      ✅ Requête exécutée: {result['metadata']['rows']} ligne(s)")
            print(f"      Colonnes: {', '.join(result['metadata']['columns'][:5])}...")
        except Exception as e:
            print(f"      ⚠️  Table F_DOCENTETE non accessible: {e}")
            print(f"      (Normal si la table n'existe pas dans votre base)")
        print()
        
        print("="*50)
        print("✅ TOUS LES TESTS RÉUSSIS!")
        print("="*50)
        print()
        print("Vous pouvez maintenant:")
        print("  - Démarrer l'agent: python -m src.main")
        print("  - Installer le service: scripts/install_service.bat")
        print()
        return 0
        
    except FileNotFoundError as e:
        print(f"❌ ERREUR: {e}")
        print()
        print("Créez d'abord le fichier de configuration:")
        print("  cp config/config.example.yaml config/config.yaml")
        print("  # Puis éditez config/config.yaml avec vos paramètres")
        return 1
        
    except Exception as e:
        print(f"❌ ERREUR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
