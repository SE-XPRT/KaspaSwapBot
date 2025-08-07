// lib/createWallet.js
const { Wallet, initKaspaFramework } = require("@kaspa/wallet");
const { RPC } = require("@kaspa/grpc-node");
const bip39 = require("bip39");
const axios = require("axios");
// Variable globale pour éviter la double initialisation
let isFrameworkInitialized = false;

/**
 * Initialise le framework Kaspa une seule fois
 */
async function ensureFrameworkInitialized() {
  if (!isFrameworkInitialized) {
    await initKaspaFramework();
    isFrameworkInitialized = true;
    console.log("✅ Kaspa Framework initialisé");
  }
}

/**
 * Crée un nouveau wallet Kaspa COMPATIBLE avec tous les autres wallets
 * Optimisé pour les bots de trading avec création rapide et compatibilité maximale
 * @param {Object} options - Options de configuration
 * @param {string} options.network - Réseau ("kaspa", "kaspatest", "kaspadev", "kaspasim")
 * @param {boolean} options.skipSync - Ignorer la synchronisation (défaut: true pour les bots)
 * @param {boolean} options.hd - Utiliser HD wallet (défaut: true)
 * @param {string} options.derivationPath - Chemin de dérivation custom
 * @returns {Object} Informations du wallet créé avec format standard
 */
async function createWallet(options = {}) {
  try {
    // Initialisation du framework (une seule fois)
    await ensureFrameworkInitialized();

    // Configuration optimisée pour les bots
    const config = {
      network: options.network || "kaspa", // mainnet par défaut
      skipSync: options.skipSync !== false, // true par défaut pour éviter les délais
      hd: options.hd !== false, // HD wallet par défaut
      derivationPath: options.derivationPath || "m/44'/111111'/0'/0/0", // Standard Kaspa
      logLevel: options.logLevel || "error", // Minimal pour les bots
      ...options,
    };

    console.log(
      `🎯 Création d'un wallet ${config.network} optimisé pour bot...`
    );

    // Génération d'une phrase mnemonic BIP39 compatible
    const mnemonic = bip39.generateMnemonic(256); // 24 mots pour sécurité maximale

    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Mnemonic générée invalide");
    }

    // Configuration réseau correcte pour Kaspa
    const networkTypes = {
      kaspa: { network: "kaspa", port: 16110, prefix: "kaspa" },
      kaspatest: { network: "kaspatest", port: 16210, prefix: "kaspatest" },
      kaspadev: { network: "kaspadev", port: 16310, prefix: "kaspadev" },
      kaspasim: { network: "kaspasim", port: 16510, prefix: "kaspasim" },
    };

    const networkConfig = networkTypes[config.network];
    if (!networkConfig) {
      throw new Error(
        `Réseau non supporté: ${config.network}. Utilisez: kaspa, kaspatest, kaspadev, kaspasim`
      );
    }

    // Créer un wallet Kaspa avec la mnemonic générée en utilisant la méthode statique
    const tempWallet = Wallet.fromMnemonic(
      mnemonic,
      {
        network: networkConfig.network,
      },
      {
        logLevel: "error",
        skipSyncBalance: true,
        syncOnce: true,
        disableAddressDerivation: false, // Activer la dérivation d'adresses
      }
    );

    // Initialiser le gestionnaire d'adresses pour générer les adresses
    tempWallet.initAddressManager();

    // Obtenir les adresses Kaspa correctes (force la génération si nécessaire)
    let receiveAddress = tempWallet.receiveAddress;
    let changeAddress = tempWallet.changeAddress;

    // Si les adresses ne sont toujours pas générées, les forcer
    if (!receiveAddress) {
      tempWallet.addressManager.receiveAddress.next();
      receiveAddress = tempWallet.receiveAddress;
    }
    if (!changeAddress) {
      tempWallet.addressManager.changeAddress.next();
      changeAddress = tempWallet.changeAddress;
    }

    // Obtenir la clé privée de l'adresse de réception (compatible Kasware/KDX)
    const receiveAddressObj = tempWallet.addressManager.receiveAddress.current;
    const privateKey = receiveAddressObj.privateKey.toString();
    const publicKey = receiveAddressObj.privateKey.toPublicKey().toString();

    // Structure de wallet STANDARD compatible avec tous les wallets Kaspa
    const walletInfo = {
      // Informations de base ESSENTIELLES
      mnemonic: mnemonic, // Utiliser la mnemonic originale générée
      privateKey: privateKey,
      publicKey: publicKey,
      address: receiveAddress.toString(),
      changeAddress: changeAddress.toString(),

      // Informations réseau
      network: config.network,
      networkName: networkConfig.network,

      // Balance (initialisée à zéro - sera mise à jour par le bot)
      balance: {
        available: 0,
        pending: 0,
        total: 0,
        formatted: {
          available: "0.00000000",
          pending: "0.00000000",
          total: "0.00000000",
        },
      },

      // Informations techniques pour compatibilité
      addressType: "kaspa",
      derivationPath: config.derivationPath,
      isHD: config.hd,

      // Métadonnées pour le bot
      createdAt: new Date().toISOString(),
      version: "2.0",
      botOptimized: true,
      compatible: true,

      // Informations de dérivation pour compatibilité avancée
      masterPrivateKey: privateKey,
      changePrivateKey: "Accessible via HDWallet",

      // Fonction utilitaire pour obtenir les clés
      getKeys: () => ({
        master: {
          private: privateKey,
          public: publicKey,
          address: receiveAddress ? receiveAddress.toString() : null,
        },
        change: {
          private: "Dérivable depuis HDWallet",
          public: "Dérivable depuis HDWallet",
          address: changeAddress ? changeAddress.toString() : null,
        },
      }),
    };

    console.log("✅ Wallet Kaspa compatible créé avec succès!");
    console.log(`privateKey: ${privateKey}`);

    console.log(`📍 Adresse principale: ${receiveAddress.toString()}`);
    console.log(`🔄 Adresse de change: ${changeAddress.toString()}`);
    console.log(`🌐 Réseau: ${config.network} (${networkConfig.network})`);

    return walletInfo;
  } catch (error) {
    console.error(
      "❌ Erreur lors de la création du wallet Kaspa :",
      error.message
    );
    throw new Error(`Création wallet échouée: ${error.message}`);
  }
}

/**
 * Importe un wallet depuis une mnemonic existante - VERSION COMPATIBLE
 * Optimisé pour importer des wallets créés avec d'autres applications Kaspa
 * @param {string} mnemonic - Phrase mnemonic BIP39 standard
 * @param {Object} options - Options de configuration
 * @returns {Object} Informations du wallet importé avec format standard
 */
async function importWallet(mnemonic, options = {}) {
  try {
    // Validation stricte de la mnemonic
    if (!mnemonic || typeof mnemonic !== "string") {
      throw new Error("Mnemonic requis et doit être une chaîne de caractères");
    }

    const cleanMnemonic = mnemonic.trim().toLowerCase();
    if (!bip39.validateMnemonic(cleanMnemonic)) {
      throw new Error(
        "Phrase mnemonic invalide - Vérifiez l'orthographe et le nombre de mots"
      );
    }

    await ensureFrameworkInitialized();

    const config = {
      network: options.network || "kaspa",
      skipSync: options.skipSync !== false, // Rapide par défaut
      derivationPath: options.derivationPath || "m/44'/111111'/0'/0/0",
      logLevel: options.logLevel || "error",
      ...options,
    };

    console.log(`🔄 Import wallet ${config.network} depuis mnemonic...`);

    // Configuration réseau identique à createWallet
    const networkTypes = {
      kaspa: { network: "kaspa", port: 16110, prefix: "kaspa" },
      kaspatest: { network: "kaspatest", port: 16210, prefix: "kaspatest" },
      kaspadev: { network: "kaspadev", port: 16310, prefix: "kaspadev" },
      kaspasim: { network: "kaspasim", port: 16510, prefix: "kaspasim" },
    };

    const networkConfig = networkTypes[config.network];
    if (!networkConfig) {
      throw new Error(`Réseau non supporté: ${config.network}`);
    }

    // Créer un wallet Kaspa depuis la mnemonic en utilisant la méthode statique
    const tempWallet = Wallet.fromMnemonic(
      cleanMnemonic,
      {
        network: networkConfig.network,
      },
      {
        logLevel: "error",
        skipSyncBalance: true,
        syncOnce: true,
        disableAddressDerivation: false,
      }
    );

    // Initialiser le gestionnaire d'adresses pour générer les adresses
    tempWallet.initAddressManager();

    // Obtenir les adresses et clés (force la génération si nécessaire)
    let receiveAddress = tempWallet.receiveAddress;
    let changeAddress = tempWallet.changeAddress;

    if (!receiveAddress) {
      tempWallet.addressManager.receiveAddress.next();
      receiveAddress = tempWallet.receiveAddress;
    }
    if (!changeAddress) {
      tempWallet.addressManager.changeAddress.next();
      changeAddress = tempWallet.changeAddress;
    }

    // Obtenir la clé privée de l'adresse de réception (compatible Kasware/KDX)
    const receiveAddressObj = tempWallet.addressManager.receiveAddress.current;
    const privateKey = receiveAddressObj.privateKey.toString();
    const publicKey = receiveAddressObj.privateKey.toPublicKey().toString(); // Structure IDENTIQUE à createWallet pour compatibilité totale
    const walletInfo = {
      mnemonic: cleanMnemonic,
      privateKey: privateKey,
      publicKey: publicKey,
      address: receiveAddress.toString(),
      changeAddress: changeAddress.toString(),

      network: config.network,
      networkName: networkConfig.network,

      balance: {
        available: 0,
        pending: 0,
        total: 0,
        formatted: {
          available: "0.00000000",
          pending: "0.00000000",
          total: "0.00000000",
        },
      },

      addressType: "kaspa",
      derivationPath: config.derivationPath,
      isHD: true,

      importedAt: new Date().toISOString(),
      version: "2.0",
      botOptimized: true,
      compatible: true,

      masterPrivateKey: privateKey,
      changePrivateKey: "Accessible via HDWallet",

      getKeys: () => ({
        master: {
          private: privateKey,
          public: publicKey,
          address: receiveAddress.toString(),
        },
        change: {
          private: "Dérivable depuis HDWallet",
          public: "Dérivable depuis HDWallet",
          address: changeAddress.toString(),
        },
      }),
    };

    console.log("✅ Wallet importé avec succès!");
    console.log(`📍 Adresse principale: ${receiveAddress.toString()}`);
    console.log(`🔄 Adresse de change: ${changeAddress.toString()}`);
    console.log(`🌐 Réseau: ${config.network}`);

    return walletInfo;
  } catch (error) {
    console.error("❌ Erreur lors de l'import du wallet :", error.message);
    throw new Error(`Import wallet échoué: ${error.message}`);
  }
}

/**
 * Exporte un wallet de manière sécurisée
 * @param {string} mnemonic - Phrase mnemonic
 * @param {string} password - Mot de passe pour le chiffrement
 * @returns {string} Mnemonic chiffrée
 */
async function exportWallet(mnemonic, password) {
  try {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Phrase mnemonic invalide");
    }

    await ensureFrameworkInitialized();

    // Création temporaire d'un wallet pour l'export
    const wallet = new Wallet(null, null, { network: "kaspa" });
    wallet.mnemonic = mnemonic;

    const encryptedMnemonic = await wallet.export(password);

    return encryptedMnemonic;
  } catch (error) {
    console.error("❌ Erreur lors de l'export du wallet :", error.message);
    throw new Error(`Export wallet échoué: ${error.message}`);
  }
}

/**
 * Importe un wallet depuis une mnemonic chiffrée
 * @param {string} password - Mot de passe de déchiffrement
 * @param {string} encryptedMnemonic - Mnemonic chiffrée
 * @param {Object} options - Options de configuration
 * @returns {Object} Informations du wallet importé
 */
async function importFromEncrypted(password, encryptedMnemonic, options = {}) {
  try {
    await ensureFrameworkInitialized();

    const config = {
      network: options.network || "kaspa",
      rpcHost: options.rpcHost || "127.0.0.1",
      syncOnce: options.syncOnce !== false,
      ...options,
    };

    const networkTypes = {
      kaspa: { port: 16110 },
      kaspatest: { port: 16210 },
      kaspadev: { port: 16310 },
      kaspasim: { port: 16510 },
    };

    const rpcPort = options.rpcPort || networkTypes[config.network].port;
    const rpc = new RPC({
      clientConfig: {
        host: `${config.rpcHost}:${rpcPort}`,
      },
    });

    const networkOptions = {
      network: config.network,
      rpc: rpc,
    };

    const wallet = await Wallet.import(
      password,
      encryptedMnemonic,
      networkOptions,
      {
        syncOnce: config.syncOnce,
        logLevel: options.logLevel || "info",
      }
    );

    console.log("🔄 Synchronisation du wallet déchiffré...");
    await wallet.sync(config.syncOnce);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout: Wallet non prêt après 30s"));
      }, 30000);

      wallet.on("ready", (balance) => {
        clearTimeout(timeout);
        resolve();
      });
    });

    const walletInfo = {
      mnemonic: wallet.mnemonic,
      privateKey: wallet.privateKey?.toString("hex"),
      publicKey: wallet.publicKey?.toString("hex"),
      address: wallet.receiveAddress,
      changeAddress: wallet.changeAddress,
      network: config.network,
      balance: wallet.balance,
      addressType: "bech32",
      derivationPath: "m/44'/111111'/0'/0/0",
    };

    if (config.syncOnce) {
      await wallet.disconnect();
    }

    return walletInfo;
  } catch (error) {
    console.error(
      "❌ Erreur lors de l'import du wallet chiffré :",
      error.message
    );
    throw new Error(`Import wallet chiffré échoué: ${error.message}`);
  }
}

/**
 * Crée directement une clé privée et son adresse Kaspa (sans mnemonic)
 * FONCTION TEMPORAIREMENT DESACTIVÉE - En attente de la bonne API Kaspa
 * @param {Object} options - Options de configuration
 * @param {string} options.network - Réseau ("kaspa", "kaspatest", "kaspadev", "kaspasim")
 * @returns {Object} Clé privée et adresse
 */
async function createPrivateKeyWallet(options = {}) {
  throw new Error(
    "Fonction temporairement désactivée - Utilisez createWallet() à la place"
  );
}

/**
 * Importe un wallet depuis une clé privée
 * FONCTION TEMPORAIREMENT DESACTIVÉE - En attente de la bonne API Kaspa
 * @param {string} privateKeyString - Clé privée au format string
 * @param {Object} options - Options de configuration
 * @returns {Object} Informations du wallet importé
 */
async function importFromPrivateKey(privateKeyString, options = {}) {
  throw new Error(
    "Fonction temporairement désactivée - Utilisez importWallet() avec une mnemonic à la place"
  );
}
/**
 * Met à jour la balance d'un wallet en temps réel (pour les bots)
 * @param {Object} walletInfo - Informations du wallet
 * @param {Object} options - Options RPC
 * @returns {Object} Wallet avec balance mise à jour
 */
async function updateWalletBalance(walletInfo, options = {}) {
  try {
    console.log(`🔍 Vérification balance pour: ${walletInfo.address}`);
    console.log(`🌐 Réseau: ${walletInfo.network}`);

    // URLs d'API selon le réseau
    let url,
      isTestnet = false;

    switch (walletInfo.network) {
      case "kaspa":
        url = `https://api.kaspa.org/addresses/${walletInfo.address}/balance`;
        break;
      case "kaspatest":
        // API testnet qui fonctionne ! Encoder l'adresse complète
        url = `https://api-tn10.kaspa.org/addresses/${encodeURIComponent(
          walletInfo.address
        )}/balance`;
        isTestnet = true;
        break;
      case "kaspadev":
        // Pour devnet, essayer la même API (à adapter si nécessaire)
        url = `https://api-tn10.kaspa.org/addresses/${encodeURIComponent(
          walletInfo.address
        )}/balance`;
        isTestnet = true;
        break;
      default:
        throw new Error(
          `Réseau ${walletInfo.network} non supporté pour la récupération de balance`
        );
    }

    console.log(`📡 Appel API: ${url}`);

    const res = await axios.get(url, {
      timeout: 10000,
      headers: {
        Accept: "application/json",
        "User-Agent": "KaspaSwapBot/1.0",
      },
    });

    console.log(`📊 Réponse API:`, res.data);

    // Parser la réponse selon le format
    let available, pending, total;

    if (isTestnet && res.data.balance !== undefined) {
      // Format API testnet: { "address": "...", "balance": 10100000000000 }
      total = res.data.balance || 0;
      available = total; // Considérer tout comme disponible
      pending = 0;
    } else {
      // Format API mainnet: { "available": 123, "pending": 456 }
      available = res.data.available || 0;
      pending = res.data.pending || 0;
      total = available + pending;
    }

    const updatedWallet = {
      ...walletInfo,
      balance: {
        available,
        pending,
        total,
        formatted: {
          available: (available / 1e8).toFixed(4),
          pending: (pending / 1e8).toFixed(4),
          total: (total / 1e8).toFixed(4),
        },
      },
      balanceSource: isTestnet ? "testnet-api" : "mainnet-api",
      lastUpdated: new Date().toISOString(),
    };

    const currency = isTestnet ? "TKAS" : "KAS";
    console.log(
      `💰 Balance récupérée: ${updatedWallet.balance.formatted.total} ${currency}`
    );
    return updatedWallet;
  } catch (error) {
    console.error(`❌ Erreur récupération balance:`, error.message);

    return {
      ...walletInfo,
      balance: {
        available: 0,
        pending: 0,
        total: 0,
        formatted: {
          available: "0.00000000",
          pending: "0.00000000",
          total: "0.00000000",
        },
      },
      balanceSource: "error",
      balanceError: error.message,
    };
  }
}
/**
 * Prépare les informations du wallet pour l'envoi au bot Telegram
 * Format optimisé pour l'affichage et l'utilisation dans un bot de trading
 * @param {Object} walletInfo - Informations du wallet
 * @param {boolean} includePrivateData - Inclure les données privées (défaut: false)
 * @returns {Object} Données formatées pour le bot
 */
function formatWalletForBot(walletInfo, includePrivateData = false) {
  const botData = {
    // Données publiques essentielles
    address: walletInfo.address,
    changeAddress: walletInfo.changeAddress,
    network: walletInfo.network,
    balance: walletInfo.balance || {
      formatted: { total: "0.00000000" },
    },

    // Informations d'affichage
    displayInfo: {
      shortAddress: `${walletInfo.address.substring(
        0,
        12
      )}...${walletInfo.address.substring(walletInfo.address.length - 8)}`,
      shortChangeAddress: `${walletInfo.changeAddress.substring(
        0,
        12
      )}...${walletInfo.changeAddress.substring(
        walletInfo.changeAddress.length - 8
      )}`,
      networkName: walletInfo.networkName || walletInfo.network,
      balanceKAS: walletInfo.balance?.formatted?.total || "0.00000000",
      status: "ready",
      compatible: true,
    },

    // Métadonnées pour le bot
    metadata: {
      createdAt: walletInfo.createdAt || walletInfo.importedAt,
      version: walletInfo.version || "2.0",
      type: walletInfo.isHD ? "HD" : "Simple",
      botOptimized: true,
    },
  };

  // Données privées seulement si demandées (pour export/backup)
  if (includePrivateData) {
    botData.private = {
      mnemonic: walletInfo.mnemonic,
      privateKey: walletInfo.privateKey,
      changePrivateKey: walletInfo.changePrivateKey,
    };
  }

  return botData;
}

/**
 * Génère un message Telegram formaté pour afficher les informations du wallet
 * @param {Object} walletInfo - Informations du wallet
 * @param {string} action - Action effectuée ("created", "imported", "updated")
 * @returns {string} Message formaté pour Telegram
 */
function generateBotMessage(walletInfo, action = "created") {
  const botData = formatWalletForBot(walletInfo);

  const actionEmojis = {
    created: "🎉",
    imported: "✅",
    updated: "🔄",
    exported: "🔐",
  };

  const actionTexts = {
    created: "Nouveau wallet créé",
    imported: "Wallet importé",
    updated: "Balance mise à jour",
    exported: "Wallet exporté",
  };

  const emoji = actionEmojis[action] || "ℹ️";
  const actionText = actionTexts[action] || "Wallet";

  return `${emoji} *${actionText}*

📍 *Adresse principale:*
\`${botData.address}\`


🔄 *Adresse de change:*
\`${botData.changeAddress}\`

🌐 *Réseau:* ${botData.displayInfo.networkName}
💰 *Balance:* ${botData.displayInfo.balanceKAS} KAS

✅ *Compatible avec tous les wallets Kaspa*
⚡ *Optimisé pour trading automatique*`;
}

module.exports = {
  createWallet,
  importWallet,
  exportWallet,
  importFromEncrypted,
  ensureFrameworkInitialized,
  createPrivateKeyWallet,
  importFromPrivateKey,
  // Nouvelles fonctions pour les bots
  updateWalletBalance,
  formatWalletForBot,
  generateBotMessage,
};
