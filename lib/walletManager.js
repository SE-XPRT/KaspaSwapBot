// lib/walletManager.js
const { Wallet } = require("@kaspa/wallet");
const { RPC } = require("@kaspa/grpc-node");
const bip39 = require("bip39");
const { ensureFrameworkInitialized } = require("./createWallet");

/**
 * Gestionnaire de wallet pour les opérations avancées
 */
class WalletManager {
  constructor() {
    this.activeWallets = new Map();
    this.networkConfig = {
      kaspa: { port: 16110 },
      kaspatest: { port: 16210 },
      kaspadev: { port: 16310 },
      kaspasim: { port: 16510 },
    };
  }

  /**
   * Charge un wallet pour les opérations
   * @param {string} mnemonic - Phrase mnemonic
   * @param {Object} options - Options de configuration
   * @returns {Object} Instance du wallet chargé
   */
  async loadWallet(mnemonic, options = {}) {
    try {
      await ensureFrameworkInitialized();

      if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error("Phrase mnemonic invalide");
      }

      const config = {
        network: options.network || "kaspa",
        rpcHost: options.rpcHost || "127.0.0.1",
        logLevel: options.logLevel || "info",
        ...options,
      };

      const walletId = this._generateWalletId(mnemonic, config.network);

      // Vérifier si le wallet est déjà chargé
      if (this.activeWallets.has(walletId)) {
        return this.activeWallets.get(walletId);
      }

      const rpcPort =
        options.rpcPort || this.networkConfig[config.network].port;
      const rpc = new RPC({
        clientConfig: {
          host: `${config.rpcHost}:${rpcPort}`,
        },
      });

      const walletOptions = {
        skipSyncBalance: false,
        addressDiscoveryExtent: 64,
        syncOnce: false, // Mode monitoring pour les opérations
        logLevel: config.logLevel,
        disableAddressDerivation: options.disableAddressDerivation || false,
      };

      const networkOptions = {
        network: config.network,
        rpc: rpc,
      };

      const wallet = Wallet.fromMnemonic(
        mnemonic,
        networkOptions,
        walletOptions
      );
      wallet.setLogLevel(config.logLevel);

      // Configuration des événements
      this._setupWalletEvents(wallet, walletId);

      // Synchronisation initiale
      await wallet.sync();

      // Attendre que le wallet soit prêt
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timeout: Wallet non prêt après 30s"));
        }, 30000);

        wallet.on("ready", () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.activeWallets.set(walletId, wallet);
      console.log(`✅ Wallet chargé: ${walletId}`);

      return wallet;
    } catch (error) {
      console.error("❌ Erreur lors du chargement du wallet :", error.message);
      throw new Error(`Chargement wallet échoué: ${error.message}`);
    }
  }

  /**
   * Obtient la balance d'un wallet
   * @param {string} mnemonic - Phrase mnemonic
   * @param {Object} options - Options de configuration
   * @returns {Object} Balance du wallet
   */
  async getBalance(mnemonic, options = {}) {
    try {
      const wallet = await this.loadWallet(mnemonic, options);

      return {
        available: wallet.balance.available,
        pending: wallet.balance.pending,
        total: wallet.balance.total,
        address: wallet.receiveAddress,
        formatted: {
          available: this._formatKAS(wallet.balance.available),
          pending: this._formatKAS(wallet.balance.pending),
          total: this._formatKAS(wallet.balance.total),
        },
      };
    } catch (error) {
      console.error(
        "❌ Erreur lors de la récupération de la balance :",
        error.message
      );
      throw new Error(`Récupération balance échouée: ${error.message}`);
    }
  }

  /**
   * Envoie une transaction
   * @param {string} mnemonic - Phrase mnemonic du wallet expéditeur
   * @param {Object} txParams - Paramètres de la transaction
   * @returns {Object} Résultat de la transaction
   */
  async sendTransaction(mnemonic, txParams) {
    try {
      const wallet = await this.loadWallet(mnemonic, txParams.options || {});

      // Validation des paramètres
      if (!txParams.toAddr) {
        throw new Error("Adresse de destination requise");
      }
      if (!txParams.amount || txParams.amount <= 0) {
        throw new Error("Montant invalide");
      }

      // Conversion du montant en sompis (base units)
      const amountInSompis = this._kasToSompis(txParams.amount);
      const feeInSompis = txParams.fee
        ? this._kasToSompis(txParams.fee)
        : 10000; // Fee par défaut

      const txSend = {
        toAddr: txParams.toAddr,
        amount: amountInSompis,
        fee: feeInSompis,
        changeAddrOverride: txParams.changeAddrOverride,
        networkFeeMax: txParams.networkFeeMax || 0,
      };

      console.log("🚀 Envoi de la transaction...", {
        to: txParams.toAddr,
        amount: this._formatKAS(amountInSompis),
        fee: this._formatKAS(feeInSompis),
      });

      const response = await wallet.submitTransaction(txSend);

      if (!response) {
        throw new Error("Échec de la transaction - réponse vide");
      }

      console.log("✅ Transaction envoyée :", response.txid);

      return {
        success: true,
        txid: response.txid,
        amount: this._formatKAS(amountInSompis),
        fee: this._formatKAS(feeInSompis),
        to: txParams.toAddr,
        from: wallet.receiveAddress,
      };
    } catch (error) {
      console.error(
        "❌ Erreur lors de l'envoi de la transaction :",
        error.message
      );
      throw new Error(`Envoi transaction échoué: ${error.message}`);
    }
  }

  /**
   * Envoie une transaction en utilisant uniquement une clé privée
   * @param {string} privateKey - Clé privée hexadécimale
   * @param {Object} txParams - Paramètres de la transaction
   * @returns {Object} Résultat de la transaction
   */

  // Corriger sendTransactionWithPrivateKey pour utiliser les nœuds publics
  async sendTransactionWithPrivateKey(privateKey, txParams) {
    try {
      await ensureFrameworkInitialized();

      console.log("🔐 Envoi transaction avec clé privée...");

      // Validation des paramètres
      if (!privateKey || privateKey.length !== 64) {
        throw new Error("Clé privée invalide (doit être 64 caractères hex)");
      }

      if (!txParams.toAddr || !txParams.amount) {
        throw new Error("Adresse de destination et montant requis");
      }

      const network = txParams.options?.network || "kaspa";

      // Configuration réseau CORRIGÉE avec support des nœuds publics
      const rpcConfig = {
        kaspa: {
          host: "127.0.0.1",
          port: 16110,
          publicNodes: ["seeder1.kaspad.net:16110", "seeder2.kaspad.net:16110"],
        },
        kaspatest: {
          host: "127.0.0.1", // Localhost par défaut
          port: 16210,
          publicNodes: [
            "tn10-seeder.kaspad.net:16210",
            "tn10-1.kaspad.net:16210",
            "tn10-2.kaspad.net:16210",
          ],
        },
        kaspadev: { host: "127.0.0.1", port: 16310 },
        kaspasim: { host: "127.0.0.1", port: 16510 },
      };

      const config = rpcConfig[network];
      if (!config) {
        throw new Error(`Réseau non supporté: ${network}`);
      }

      // UTILISER LES NŒUDS PUBLICS pour kaspatest
      let rpcHost, rpcPort;

      if (network === "kaspatest" && config.publicNodes.length > 0) {
        // Choisir un nœud public aléatoire
        const randomNode =
          config.publicNodes[
            Math.floor(Math.random() * config.publicNodes.length)
          ];
        const [host, port] = randomNode.split(":");
        rpcHost = host;
        rpcPort = parseInt(port);
        console.log(`🌐 Utilisation du nœud public: ${randomNode}`);
      } else {
        // Utiliser localhost pour les autres réseaux
        rpcHost = config.host;
        rpcPort = config.port;
        console.log(`🏠 Utilisation du nœud local: ${rpcHost}:${rpcPort}`);
      }

      console.log(`🔗 Réseau: ${network} (${rpcHost}:${rpcPort})`);

      // Créer une connexion RPC
      let rpc;
      try {
        console.log(`🔗 Création de la connexion RPC...`);
        rpc = new RPC({
          clientConfig: {
            host: `${rpcHost}:${rpcPort}`,
            reconnect: false,
          },
        });

        console.log(`🔗 Tentative de connexion à ${rpcHost}:${rpcPort}...`);

        // Tester la connexion avec timeout court
        const connectPromise = rpc.connect();
        const connectTimeout = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout connexion RPC (10s)")),
            10000
          )
        );

        await Promise.race([connectPromise, connectTimeout]);
        console.log("✅ Connexion RPC établie");
      } catch (connectError) {
        console.error("❌ Erreur de connexion RPC:", connectError.message);

        if (network === "kaspatest") {
          // Essayer un autre nœud public
          const otherNodes = config.publicNodes.filter(
            (node) => node !== `${rpcHost}:${rpcPort}`
          );
          if (otherNodes.length > 0) {
            const fallbackNode = otherNodes[0];
            const [fallbackHost, fallbackPort] = fallbackNode.split(":");
            console.log(`🔄 Tentative avec nœud de secours: ${fallbackNode}`);

            rpc = new RPC({
              clientConfig: {
                host: `${fallbackHost}:${fallbackPort}`,
                reconnect: false,
              },
            });

            const fallbackConnectPromise = rpc.connect();
            const fallbackTimeout = new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Timeout nœud de secours (10s)")),
                10000
              )
            );

            try {
              await Promise.race([fallbackConnectPromise, fallbackTimeout]);
              console.log("✅ Connexion de secours établie");

              // Mettre à jour les variables pour le logging
              rpcHost = fallbackHost;
              rpcPort = parseInt(fallbackPort);
            } catch (fallbackError) {
              // Tous les nœuds RPC ont échoué, utiliser l'API alternative
              console.error(
                "❌ Tous les nœuds RPC inaccessibles, utilisation API alternative..."
              );

              const ApiTransactionSender = require("./apiTransactionSender");
              const apiSender = new ApiTransactionSender();

              return await apiSender.sendTransactionViaApiLegacy(
                privateKey,
                txParams
              );
            }
          } else {
            // Aucun nœud de secours, utiliser l'API alternative
            console.error(
              "❌ Aucun nœud de secours disponible, utilisation API alternative..."
            );

            const ApiTransactionSender = require("./apiTransactionSender");
            const apiSender = new ApiTransactionSender();

            return await apiSender.sendTransactionViaApiLegacy(
              privateKey,
              txParams
            );
          }
        } else {
          throw connectError;
        }
      }

      // Créer un wallet temporaire avec la clé privée
      const walletOptions = {
        skipSyncBalance: false,
        logLevel: "error",
      };

      const networkOptions = {
        network: network,
        rpc: rpc,
      };

      // UTILISER fromPrivateKey() au lieu de new Wallet()
      const wallet = Wallet.fromPrivateKey(
        privateKey,
        networkOptions,
        walletOptions
      );

      wallet.setLogLevel("error");

      console.log("🔄 Synchronisation du wallet...");

      // Ajouter un timeout COURT pour la synchronisation (15s au lieu de 30s)
      const syncPromise = wallet.sync();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Timeout: Synchronisation échouée après 15s")),
          15000
        )
      );

      try {
        await Promise.race([syncPromise, timeoutPromise]);
        console.log("✅ Wallet synchronisé avec la clé privée");
      } catch (syncError) {
        console.error("❌ Erreur de synchronisation:", syncError.message);

        // Essayer une synchronisation légère
        console.log("🔄 Tentative de synchronisation légère...");

        try {
          // Juste vérifier que le wallet est utilisable
          const address = wallet.receiveAddress;
          console.log(`📍 Adresse wallet récupérée: ${address}`);
          console.log("⚠️ Synchronisation partielle, on continue...");
        } catch (addressError) {
          throw new Error(`Wallet inutilisable: ${addressError.message}`);
        }
      }

      // Récupérer l'adresse source
      const sourceAddress = wallet.receiveAddress;
      console.log(`📤 Adresse source: ${sourceAddress}`);

      // Vérifier la balance avant l'envoi
      console.log(
        `💰 Balance du wallet: ${this._formatKAS(
          wallet.balance.available
        )} TKAS disponible`
      );

      // Convertir le montant
      const amountInSompis = this._kasToSompis(txParams.amount);
      console.log(
        `💰 Montant: ${txParams.amount} ${
          network === "kaspatest" ? "TKAS" : "KAS"
        } (${amountInSompis} sompis)`
      );

      // Vérifier si on a assez de fonds
      if (wallet.balance.available < amountInSompis) {
        throw new Error(
          `Solde insuffisant: ${this._formatKAS(
            wallet.balance.available
          )} disponible, ${txParams.amount} requis`
        );
      }

      console.log("🚀 Envoi de la transaction...");

      // Envoyer la transaction avec timeout
      const txPromise = wallet.submitTransaction({
        toAddr: txParams.toAddr,
        amount: amountInSompis,
        fee: 0, // Frais automatiques
      });

      const txTimeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Timeout: Transaction échouée après 60s")),
          60000
        )
      );

      const tx = await Promise.race([txPromise, txTimeoutPromise]);

      console.log(`🎉 Transaction envoyée avec succès: ${tx.id}`);

      // Déconnecter proprement
      try {
        await wallet.disconnect();
        console.log("🔌 Wallet déconnecté");
      } catch (disconnectError) {
        console.warn("⚠️ Erreur déconnexion wallet:", disconnectError.message);
      }

      try {
        await rpc.disconnect();
        console.log("🔌 RPC déconnecté");
      } catch (rpcDisconnectError) {
        console.warn("⚠️ Erreur déconnexion RPC:", rpcDisconnectError.message);
      }

      return {
        success: true,
        txid: tx.id,
        from: sourceAddress,
        to: txParams.toAddr,
        amount: txParams.amount,
        fee: this._formatKAS(tx.fee || 0),
        network: network,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Erreur transaction avec clé privée:", error.message);

      // Messages d'erreur plus utiles
      let errorMessage = error.message;
      let suggestions = "";

      if (
        error.message.includes("connection") ||
        error.message.includes("ECONNREFUSED")
      ) {
        suggestions =
          "💡 Suggestions :\n" +
          "• Les nœuds publics peuvent être temporairement indisponibles\n" +
          "• Essayez de relancer la transaction\n" +
          "• Ou utilisez Kasware/KDX pour l'envoi direct";
      }

      return {
        success: false,
        error: errorMessage,
        suggestions: suggestions,
      };
    }
  }
  /**
   * Décharge un wallet de la mémoire
   * @param {string} mnemonic - Phrase mnemonic
   * @param {string} network - Réseau
   */
  async unloadWallet(mnemonic, network = "kaspa") {
    try {
      const walletId = this._generateWalletId(mnemonic, network);

      if (this.activeWallets.has(walletId)) {
        const wallet = this.activeWallets.get(walletId);
        await wallet.disconnect();
        this.activeWallets.delete(walletId);
        console.log(`✅ Wallet déchargé: ${walletId}`);
      }
    } catch (error) {
      console.error(
        "❌ Erreur lors du déchargement du wallet :",
        error.message
      );
    }
  }

  /**
   * Décharge tous les wallets actifs
   */
  async unloadAllWallets() {
    try {
      const promises = Array.from(this.activeWallets.values()).map((wallet) =>
        wallet.disconnect().catch(console.error)
      );

      await Promise.all(promises);
      this.activeWallets.clear();
      console.log("✅ Tous les wallets déchargés");
    } catch (error) {
      console.error(
        "❌ Erreur lors du déchargement des wallets :",
        error.message
      );
    }
  }

  /**
   * Génère un ID unique pour un wallet
   * @private
   */
  _generateWalletId(mnemonic, network) {
    const crypto = require("crypto");
    return crypto
      .createHash("sha256")
      .update(`${mnemonic}-${network}`)
      .digest("hex")
      .substring(0, 16);
  }

  /**
   * Configure les événements du wallet
   * @private
   */
  _setupWalletEvents(wallet, walletId) {
    wallet.on("balance-update", (balance) => {
      console.log(`💰 Balance mise à jour [${walletId}]:`, {
        available: this._formatKAS(balance.available),
        pending: this._formatKAS(balance.pending),
        total: this._formatKAS(balance.total),
      });
    });

    wallet.on("api-offline", () => {
      console.log(`🔴 API hors ligne [${walletId}]`);
    });

    wallet.on("api-online", () => {
      console.log(`🟢 API en ligne [${walletId}]`);
    });

    wallet.on("utxo-change", (data) => {
      console.log(`🔄 UTXO changé [${walletId}]:`, data);
    });
  }

  /**
   * Convertit les sompis en KAS
   * @private
   */
  _formatKAS(sompis) {
    return (sompis / 100000000).toFixed(8); // 1 KAS = 100,000,000 sompis
  }

  /**
   * Convertit les KAS en sompis
   * @private
   */
  _kasToSompis(kas) {
    return Math.floor(kas * 100000000);
  }
}

module.exports = WalletManager;
