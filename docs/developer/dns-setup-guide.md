# Guide de Configuration DNS (Admin Domaine)

!!! info "Cible de ce document"
    Ce guide est destiné à l'administrateur du nom de domaine `nafakatech.com`. Il contient les informations nécessaires pour diriger le trafic vers le serveur Cockpit.

Pour que la plateforme Cockpit soit opérationnelle, plusieurs enregistrements DNS doivent être configurés dans votre interface de gestion de domaine (Registrar).

---

## 1. Enregistrements A (IPv4)

Vous devez diriger votre domaine principal et ses sous-domaines vers l'adresse IP publique du serveur.

| Sous-domaine | Type | Cible (IP Serveur) | Usage |
|---|---|---|---|
| `cockpit.nafakatech.com` | **A** | `IP_DU_SERVEUR` | Application Client (DAF / Utilisateurs) |
| `admin.cockpit.nafakatech.com` | **A** | `IP_DU_SERVEUR` | Interface SuperAdmin |
| `api.cockpit.nafakatech.com` | **A** | `IP_DU_SERVEUR` | (Optionnel) Endpoint API direct |

> [!TIP]
> Si vous souhaitez utiliser un seul certificat SSL pour tous les sous-domaines "cockpit", nous recommandons d'utiliser cette structure.

---

## 2. Configuration du Firewall (Hébergeur)

Si votre serveur est derrière un Firewall réseau (ex: AWS Security Groups, Azure NSG, Firewall OVH), assurez-vous que les ports suivants sont **ouverts en entrée** pour l'IP du serveur :

- **Port 80 (HTTP)** : Nécessaire pour les challenges Let's Encrypt et la redirection HTTPS.
- **Port 443 (HTTPS)** : Trafic sécurisé principal.

*Tous les autres ports (3000, 5432, 6379, etc.) doivent rester fermés au public.*

---

## 3. SSL / TLS

La plateforme Cockpit gère automatiquement ses propres certificats SSL via **Let's Encrypt** (win-acme sur Windows). 

- **Pas besoin d'acheter de certificat** : Le serveur s'occupe de générer et de renouveler les certificats gratuitement.
- **Délégation** : Assurez-vous simplement que le port 80 est bien dirigé vers le serveur pour que win-acme puisse valider la possession du domaine.

---

## 4. Recommandations techniques

### TTL (Time To Live)
Lors de la configuration initiale ou d'une migration, réglez le **TTL à 300 secondes** (5 minutes). Cela permettra une propagation rapide des changements. Une fois la plateforme stable, vous pourrez repasser à 3600 (1 heure).

### Propagation
Notez que les changements DNS peuvent prendre de ** quelques minutes à 24 heures** pour être effectifs partout dans le monde. Vous pouvez vérifier l'état de la propagation via des outils comme [DNSChecker.org](https://dnschecker.org/).

---

## 5. Résumé pour l'IT

Si vous déléguez cette tâche à un technicien, voici le résumé :
> "Veuillez créer des enregistrements **A** pour `cockpit.nafakatech.com` et `admin.cockpit.nafakatech.com` pointant vers l'IP `IP_DU_SERVEUR`. Assurez-vous que les ports 80 et 443 sont ouverts en entrée sur cette IP."
