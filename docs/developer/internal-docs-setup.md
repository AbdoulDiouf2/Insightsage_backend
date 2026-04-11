# Configuration de la Documentation Interne (MkDocs)

!!! danger "Usage Interne Uniquement"
    Cette documentation contient des informations sensibles (architecture, schémas DB, sécurité). **Elle ne doit jamais être exposée publiquement.**

---

## 1. Solution "Zéro Infra" : `mkdocs serve` (Recommandé)

C'est la méthode la plus sûre. La documentation est servie localement sur le poste de chaque développeur.

### Étapes détaillées :
1.  **Installer Python** : Téléchargez et installez Python 3.12+ depuis [python.org](https://www.python.org/). Cochez bien **"Add Python to PATH"**.
2.  **Installer les dépendances** :
    ```powershell
    pip install mkdocs-material mkdocs-print-site-plugin
    ```
3.  **Lancer le serveur** :
    ```powershell
    cd C:\votre-chemin\insightsage_backend
    mkdocs serve
    ```
4.  **Accès** : Ouvrez votre navigateur sur `http://localhost:8000`. 
    *   *Note : Toute modification d'un fichier `.md` rafraîchit automatiquement la page.*

---

## 2. Déploiement IIS avec Restriction IP (Sur le serveur)

Pour avoir un lien centralisé sans pour autant l'ouvrir au monde entier.

### Étapes détaillées :

#### A. Installer le module de sécurité IIS
1.  Ouvrez le **Gestionnaire de serveur** sur Windows Server.
2.  **Gérer** > **Ajouter des rôles et fonctionnalités**.
3.  Allez jusqu'à **Rôle Serveur Web (IIS)** > **Serveur Web** > **Sécurité**.
4.  Cochez **Restrictions par adresse IP et domaine** et terminez l'installation.

#### B. Créer le site dans IIS
1.  **IIS Manager** > Clic droit sur **Sites** > **Ajouter un site Web**.
2.  **Nom du site** : `Cockpit-Docs-Internal`.
3.  **Répertoire physique** : `C:\Cockpit\repos\insightsage_backend\site`.
4.  **Liaison** : HTTP, Port `8080` (utilisez un port différent du port 80 standard).
5.  *Ne pas configurer de nom d'hôte public.*

#### C. Configurer la restriction (Le "cadenas")
1.  Sélectionnez votre site `Cockpit-Docs-Internal` dans IIS.
2.  Double-cliquez sur **Restrictions par adresse IP et domaine**.
3.  Dans le panneau Actions (à droite), cliquez sur **Modifier les paramètres de fonction**.
4.  Réglez "Accès pour les clients non spécifiés" sur **Refuser**.
5.  Cliquez sur **Ajouter une entrée d'autorisation** et saisissez les adresses IP publiques de votre équipe.

---

## 3. L'entrée dans le fichier `hosts` (URL "fictive")

Permet d'utiliser une URL comme `http://docs.cockpit.internal` sur vos postes sans qu'elle n'existe sur le DNS public.

### Étapes détaillées :
1.  **Sur le serveur** : Le site IIS doit être configuré (comme à l'étape 2) mais avec le nom d'hôte `docs.cockpit.internal` sur le port 80.
2.  **Sur votre poste Windows** :
    -   Recherchez **Bloc-notes**, clic droit > **Exécuter en tant qu'administrateur**.
    -   Ouvrez le fichier : `C:\Windows\System32\drivers\etc\hosts`.
    -   Ajoutez cette ligne à la fin (remplacez `1.2.3.4` par l'IP de votre serveur) :
        ```text
        1.2.3.4  docs.cockpit.internal
        ```
3.  **Accès** : Vous pouvez maintenant taper `http://docs.cockpit.internal` dans votre navigateur.

---

## 4. Authentification IIS (Le "Popup" de sécurité)

Si vous voulez une sécurité par identifiant/mot de passe (en plus ou à la place de l'IP), vous pouvez activer l'authentification native de IIS.

*   **Visuel** : Une fenêtre surgissante du navigateur demande un login/pass.
*   **Avantage** : Fonctionne de n'importe où (même hors du bureau) si vous ne restreignez pas par IP.

### Étapes détaillées :
1.  **Installer le module** :
    -   Gestionnaire de serveur > Ajouter des rôles et fonctionnalités.
    -   Rôle Serveur Web (IIS) > Sécurité > Cochez **Authentification de base** (Basic Authentication).
2.  **Créer un utilisateur sur le serveur** :
    -   Clic droit sur le bouton "Démarrer" > **Gestion de l'ordinateur**.
    -   Utilisateurs et groupes locaux > Utilisateurs.
    -   Créez un utilisateur (ex: `cockpit-dev`) avec un mot de passe robuste.
3.  **Activer dans IIS** :
    -   Sélectionnez votre site `Cockpit-Docs-Internal`.
    -   Double-cliquez sur **Authentification**.
    -   Désactivez "Authentification anonyme".
    -   Activez **Authentification de base**.

---

## Pourquoi est-ce vital pour la sécurité ?

*   **Architecture Exposed** : La doc explique comment fonctionnent vos Guards, vos routes API et vos relations de base de données.
*   **Credentials Risk** : Un oubli de mot de passe dans un fichier de config ou un `.brouillon.md` peut arriver.
*   **Shadow IT** : Une doc obsolète publique est une mine d'or pour trouver des vulnérabilités sur d'anciennes versions.
