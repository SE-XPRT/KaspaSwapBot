# Kaspa Swap Bot

Bot Telegram pour la gestion de wallets Kaspa utilisant le Kaspa Wallet Framework avec les meilleures pratiques.

## ✨ Fonctionnalités

- 🔐 **Génération de wallets sécurisés** (mnemonic 24 mots)
- 📥 **Import/Export** compatible avec Kasware, KDX et autres wallets Kaspa
- 🌐 **Support multi-réseaux** (Mainnet, Testnet, Devnet, Simnet)
- 💰 **Gestion des balances** en temps réel
- 🚀 **Transactions sécurisées** avec frais automatiques
- 🔄 **Synchronisation optimisée** avec gestion des événements

## 🏗️ Architecture

### Structure du projet

```
kaspa-swap-bot/
├── lib/
│   ├── createWallet.js    # Création et import de wallets
│   ├── walletManager.js   # Gestionnaire de wallets avancé
│   └── config.js          # Configuration centralisée
├── index.js               # Bot Telegram principal
├── package.json
└── README.md
```

### Bonnes pratiques implémentées

#### 1. **Framework Initialization**

```javascript
// Initialisation unique du framework
await initKaspaFramework();
```

#### 2. **Configuration RPC appropriée**

```javascript
const rpc = new RPC({
  clientConfig: {
    host: `${host}:${port}`,
  },
});
```

#### 3. **Options de wallet optimisées**

```javascript
const walletOptions = {
  skipSyncBalance: false,
  addressDiscoveryExtent: 64,
  syncOnce: true, // Pour éviter les connexions permanentes
  logLevel: "info",
  disableAddressDerivation: false,
};
```

#### 4. **Gestion des événements**

```javascript
wallet.on("ready", (balance) => {
  console.log("Wallet prêt:", balance);
});

wallet.on("balance-update", (balance) => {
  console.log("Balance mise à jour:", balance);
});
```

#### 5. **Gestion des erreurs et timeouts**

```javascript
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error("Timeout: Wallet non prêt"));
  }, 30000);

  wallet.on("ready", () => {
    clearTimeout(timeout);
    resolve();
  });
});
```

## 🚀 Installation

1. **Clonez le repository**

```bash
git clone <votre-repo>
cd kaspa-swap-bot
```

2. **Installez les dépendances**

```bash
npm install
```

3. **Configuration**
   Créez un fichier `.env` :

```env
BOT_TOKEN=votre_token_telegram
```

4. **Démarrage**

```bash
npm start
```

## 🎯 Commandes Bot

### Gestion des wallets

- `/generate` - Crée un nouveau wallet (mnemonic 24 mots)
- `/import` - Importe un wallet existant via mnemonic
- `/export <password>` - Exporte le wallet chiffré

### Opérations

- `/balance` - Affiche la balance actuelle
- `/send <adresse> <montant>` - Envoie des KAS

### Configuration

- `/network <réseau>` - Change de réseau
- `/help` - Aide détaillée

## 🌐 Réseaux supportés

| Réseau      | Description | Port  | Préfixe    |
| ----------- | ----------- | ----- | ---------- |
| `kaspa`     | Mainnet     | 16110 | kaspa:     |
| `kaspatest` | Testnet     | 16210 | kaspatest: |
| `kaspadev`  | Devnet      | 16310 | kaspadev:  |
| `kaspasim`  | Simnet      | 16510 | kaspasim:  |

## 🔐 Sécurité

### Mnemonic 24 mots

- Génération avec 256 bits d'entropie
- Compatible BIP39
- Compatible avec tous les wallets Kaspa

### Gestion des clés privées

- Pas d'exposition directe des clés privées
- Chiffrement disponible pour l'export
- Suppression automatique des messages sensibles

### Validation des entrées

- Validation des montants et adresses
- Vérification des mnemonics
- Gestion des timeouts

## 🔧 Configuration avancée

### Personnalisation des réseaux

```javascript
const customOptions = {
  network: "kaspatest",
  rpcHost: "custom-host.com",
  rpcPort: 16210,
  logLevel: "verbose",
};
```

### Frais de transaction

```javascript
const txParams = {
  toAddr: "kaspa:...",
  amount: 1.5,
  fee: 0.001,
  networkFeeMax: 0.01,
};
```

## 🤝 Compatibilité

Ce bot est entièrement compatible avec :

- **Kasware** - Extension navigateur
- **KDX** - Wallet desktop
- **kaspa-wallet-cli** - Wallet CLI
- Tous les wallets respectant les standards Kaspa

### Format d'adresse

- Utilise le format bech32 standard Kaspa
- Préfixes de réseau appropriés
- Chemins de dérivation HD standards (`m/44'/111111'/0'/0/0`)

## 📝 Logs et débogage

### Niveaux de log disponibles

- `error` - Erreurs uniquement
- `warn` - Avertissements et erreurs
- `info` - Informations générales (défaut)
- `verbose` - Détails des opérations
- `debug` - Débogage complet

### Configuration du logging

```javascript
wallet.setLogLevel("verbose");
```

## 🔄 Gestion des connexions

### Mode synchronisation

- `syncOnce: true` - Synchronisation rapide puis déconnexion
- `syncOnce: false` - Mode monitoring continu

### Déconnexion propre

```javascript
await wallet.disconnect();
await walletManager.unloadAllWallets();
```

## 📊 Monitoring

### Événements surveillés

- `api-online/offline` - État de la connexion
- `balance-update` - Changements de balance
- `utxo-change` - Modifications UTXO
- `blue-score-changed` - Nouveaux blocs

## ⚠️ Notes importantes

1. **Sauvegardez toujours vos mnemonics** dans un endroit sûr
2. **Ne partagez jamais** vos clés privées ou mnemonics
3. **Testez d'abord** sur testnet avant le mainnet
4. **Surveillez les frais** de transaction
5. **Utilisez des mots de passe forts** pour l'export chiffré

## 🆘 Support

En cas de problème :

1. Vérifiez les logs du bot
2. Testez sur testnet
3. Consultez la documentation Kaspa Wallet Framework
4. Vérifiez la connectivité au nœud Kaspa

## 📚 Ressources

- [Kaspa Wallet Framework](https://github.com/kaspanet/kaspa-wallet)
- [Documentation Kaspa](https://kaspa.org)
- [Kasware Wallet](https://kasware.xyz)
- [KDX Wallet](https://github.com/aspectron/kdx)
# KaspaSwapBot
