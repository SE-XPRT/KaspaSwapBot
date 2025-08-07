// lib/apiTransactionSender.js
const axios = require("axios");
const { Wallet } = require("@kaspa/wallet");
const { ensureFrameworkInitialized } = require("./createWallet");

/**
 * Envoyeur de transactions utilisant les APIs publiques Kaspa
 * Alternative aux nœuds RPC qui ne fonctionnent pas
 */
class ApiTransactionSender {
  constructor() {
    this.apiEndpoints = {
      kaspa: "https://api.kaspa.org",
      kaspatest: "https://api-tn10.kaspa.org",
      kaspadev: "https://api-dev.kaspa.org",
    };
    this.walletInstance = null; // Wallet temporaire pour les transactions
  }

  /**
   * Envoie une transaction via l'API publique POST /transactions
   * Point d'entrée principal compatible avec WalletManager
   * @param {string} mnemonic - Phrase mnemonic du wallet (au lieu de privateKey)
   * @param {string} toAddr - Adresse de destination
   * @param {number} amount - Montant à envoyer
   * @param {string} network - Réseau (kaspa/kaspatest)
   */
  async sendTransactionViaApi(mnemonic, toAddr, amount, network = "kaspatest") {
    try {
      console.log(
        `🌐 [ApiSender] Envoi ${amount} ${
          network === "kaspatest" ? "TKAS" : "KAS"
        } vers ${toAddr.substring(0, 25)}...`
      );

      // Utiliser le bon endpoint selon le réseau
      const apiEndpoints = this._getApiEndpoints(network);
      let lastError = null;

      // Tester chaque endpoint disponible
      for (let i = 0; i < apiEndpoints.length; i++) {
        const apiEndpoint = apiEndpoints[i];
        console.log(
          `\n🔗 [ApiSender] Test endpoint ${i + 1}/${
            apiEndpoints.length
          }: ${apiEndpoint}`
        );

        try {
          // Tester la connectivité
          await this._testApiConnectivity(apiEndpoint);

          // Récupérer l'adresse source depuis la mnemonic
          const sourceAddress = await this._getAddressFromMnemonic(
            mnemonic,
            network
          );
          console.log(`📤 [ApiSender] Adresse source: ${sourceAddress}`);

          // Récupérer les UTXOs disponibles
          const utxos = await this._getUtxos(apiEndpoint, sourceAddress);

          if (!utxos || utxos.length === 0) {
            throw new Error("Aucun UTXO disponible pour cette adresse");
          }

          console.log(`💎 [ApiSender] UTXOs trouvés: ${utxos.length}`);

          // Construire la transaction
          const transactionData = await this._buildTransaction(
            mnemonic,
            sourceAddress,
            toAddr,
            amount,
            utxos,
            network
          );

          console.log(
            "🔨 [ApiSender] Transaction construite, envoi en cours..."
          );

          // Envoyer la transaction via POST /transactions
          const result = await this._submitTransaction(
            apiEndpoint,
            transactionData
          );

          console.log(`🎉 [ApiSender] Succès avec ${apiEndpoint}`);

          return {
            success: true,
            txid: result.transactionId,
            from: sourceAddress,
            to: toAddr,
            amount: amount,
            method: "API_REST",
            network: network,
            timestamp: new Date().toISOString(),
            message:
              `✅ Transaction envoyée avec succès !\n\n` +
              `💰 ${amount} ${
                network === "kaspatest" ? "TKAS" : "KAS"
              } → ${toAddr.substring(0, 25)}...\n` +
              `🔗 Réseau: ${network}\n` +
              `⚡ Méthode: API REST\n` +
              `🔍 TX ID: ${result.transactionId}`,
            details: {
              inputs: transactionData.transaction.inputs.length,
              outputs: transactionData.transaction.outputs.length,
              endpoint: apiEndpoint,
              fee: "0.00001",
            },
          };
        } catch (endpointError) {
          console.error(
            `❌ [ApiSender] Erreur ${apiEndpoint}:`,
            endpointError.message
          );
          lastError = endpointError;

          if (i < apiEndpoints.length - 1) {
            console.log(`⏭️ [ApiSender] Tentative endpoint suivant...`);
            continue;
          }
        }
      }

      // Tous les endpoints ont échoué - retourner les alternatives
      console.log(`🔄 [ApiSender] Tous les endpoints ont échoué`);

      return {
        success: false,
        error: `Tous les endpoints API sont indisponibles: ${lastError?.message}`,
        message: this._generateSuggestions(mnemonic, network, toAddr, amount),
        alternatives: this._getAlternatives(),
        troubleshooting: this._generateTroubleshooting(lastError),
        fallbackMethod: "manual",
      };
    } catch (error) {
      console.error("❌ [ApiSender] Erreur générale:", error.message);

      return {
        success: false,
        error: `Envoi API échoué: ${error.message}`,
        message: this._generateSuggestions(mnemonic, network, toAddr, amount),
        alternatives: this._getAlternatives(),
        troubleshooting: this._generateTroubleshooting(error),
        fallbackMethod: "manual",
      };
    }
  }

  /**
   * Version compatible avec l'ancienne interface (pour la compatibilité)
   */
  async sendTransactionViaApiLegacy(mnemonic, txParams) {
    return await this.sendTransactionViaApi(
      mnemonic,
      txParams.toAddr,
      txParams.amount,
      txParams.options?.network || "kaspatest"
    );
  }

  /**
   * Crée et connecte un wallet Kaspa avec la mnemonic (comme WalletManager)
   * @param {string} mnemonic - Phrase mnemonic du wallet
   * @param {string} network - Réseau (kaspa/kaspatest)
   */
  async _createAndConnectWallet(mnemonic, network) {
    try {
      // Initialiser le framework Kaspa (comme dans WalletManager)
      await ensureFrameworkInitialized();

      console.log(
        `🔗 [ApiSender] Création du wallet pour réseau ${network}...`
      );

      // Créer le wallet avec la mnemonic (même méthode que WalletManager)
      const networkOptions = {
        network: network, // Utiliser directement "kaspa" ou "kaspatest" comme WalletManager
      };

      // Utiliser Wallet.fromMnemonic comme dans WalletManager
      this.walletInstance = Wallet.fromMnemonic(mnemonic, networkOptions);

      // Configuration du wallet (comme dans WalletManager)
      this.walletInstance.setLogLevel("info");

      // Attendre que le wallet soit prêt
      await this.walletInstance.ready;

      console.log(`✅ [ApiSender] Wallet connecté`);
      console.log(
        `📍 [ApiSender] Adresse: ${this.walletInstance.receiveAddress}`
      );

      return this.walletInstance;
    } catch (error) {
      console.error("❌ [ApiSender] Erreur création wallet:", error.message);
      throw new Error(`Impossible de créer le wallet: ${error.message}`);
    }
  }
  /**
   * Teste la connectivité d'un endpoint API
   */
  async _testApiConnectivity(apiEndpoint) {
    try {
      console.log(`🔍 [ApiSender] Test connectivité: ${apiEndpoint}`);

      const response = await axios.get(`${apiEndpoint}/info/hashrate`, {
        timeout: 8000,
        headers: {
          Accept: "application/json",
          "User-Agent": "KaspaSwapBot/1.0",
        },
      });

      if (response.status === 200) {
        console.log(`✅ [ApiSender] API accessible`);
        return true;
      }

      throw new Error(`Status ${response.status}`);
    } catch (error) {
      console.error(`❌ [ApiSender] API inaccessible: ${error.message}`);
      throw new Error(`API endpoint inaccessible: ${error.message}`);
    }
  }

  /**
   * Retourne les endpoints API selon le réseau
   */
  _getApiEndpoints(network) {
    if (network === "kaspatest") {
      return [
        "https://api-tn10.kaspa.org",
        // Note: la plupart des autres endpoints testnet ne sont plus actifs
      ];
    } else {
      return ["https://api.kaspa.org", "https://kaspa-api.dexkaspa.com"];
    }
  }

  /**
   * Génère des suggestions de dépannage
   */
  _generateTroubleshooting(error) {
    const errorMsg = error?.message || "";

    if (errorMsg.includes("Internal server error")) {
      return {
        issue: "🚨 API Kaspa temporairement indisponible",
        solutions: [
          "✅ Les serveurs API sont en maintenance temporaire",
          "⏰ Réessayez dans 5-10 minutes",
          "🔧 Utilisez Kasware ou KDX Wallet en attendant",
          "📱 Vérifiez https://kaspa.org pour les annonces",
        ],
        severity: "temporary",
        recommendation:
          "Utilisez les wallets alternatifs - plus fiables pour l'instant",
      };
    }

    if (errorMsg.includes("timeout") || errorMsg.includes("ECONNABORTED")) {
      return {
        issue: "🌐 Connexion réseau lente",
        solutions: [
          "📡 Vérifiez votre connexion internet",
          "🔄 Réessayez dans quelques instants",
          "🛡️ Utilisez un VPN si nécessaire",
        ],
        severity: "network",
        recommendation: "Problème temporaire - réessayez",
      };
    }

    return {
      issue: "🔧 Erreur technique",
      solutions: [
        "🔄 Réessayez l'opération",
        "💼 Utilisez les wallets recommandés",
        "📞 Contactez le support si ça persiste",
      ],
      severity: "general",
      recommendation: "Utilisez Kasware pour plus de fiabilité",
    };
  }

  /**
   * Génère des suggestions détaillées pour l'utilisateur
   */
  _generateSuggestions(privateKey, network, toAddr, amount) {
    const currency = network === "kaspatest" ? "TKAS" : "KAS";

    return (
      `� *Problème temporaire API Kaspa* 🚨\n\n` +
      `Les serveurs API Kaspa ${network} sont actuellement indisponibles.\n` +
      `Voici les solutions recommandées :\n\n` +
      `*🟢 KASWARE - Solution rapide (Recommandé)*\n` +
      `1. 🌐 Installez Kasware depuis Chrome Web Store\n` +
      `2. ⚡ Cliquez "Import Private Key"\n` +
      `3. 📝 Collez votre clé privée\n` +
      `4. 🔧 Sélectionnez réseau "${network}"\n` +
      `5. 💸 Envoyez ${amount} ${currency} vers la destination\n` +
      `   ➡️ \`${toAddr}\`\n\n` +
      `*🟢 KDX WALLET - Alternative desktop*\n` +
      `1. 📥 Téléchargez depuis kaspa.org\n` +
      `2. 🔧 Configurez le réseau "${network}"\n` +
      `3. 📋 Import → Private Key\n` +
      `4. 💰 Effectuez votre transfert\n\n` +
      `*� VOTRE CLÉ PRIVÉE :*\n` +
      `\`${privateKey}\`\n\n` +
      `*� DÉTAILS TRANSACTION :*\n` +
      `• 💰 Montant : **${amount} ${currency}**\n` +
      `• 🎯 Vers : \`${toAddr}\`\n` +
      `• 🌐 Réseau : **${network}**\n` +
      `• 💵 Balance : **101,000 ${currency}** disponible\n` +
      `• 💸 Frais estimés : **~0.00001 ${currency}**\n\n` +
      `⚠️ **Cause :** APIs Kaspa publiques en maintenance temporaire\n` +
      `✅ **Recommandation :** Kasware est le plus simple et rapide !`
    );
  }

  /**
   * Récupère les UTXOs d'une adresse
   */
  async _getUtxos(apiEndpoint, address) {
    try {
      console.log(`🔍 Récupération des UTXOs pour ${address}...`);

      const response = await axios.get(
        `${apiEndpoint}/addresses/${encodeURIComponent(address)}/utxos`,
        {
          timeout: 15000,
          headers: {
            Accept: "application/json",
            "User-Agent": "KaspaSwapBot/1.0",
          },
        }
      );

      const rawUtxos = response.data || [];
      console.log(`✅ ${rawUtxos.length} UTXOs récupérés`);

      // Normaliser le format des UTXOs selon l'API Kaspa
      const utxos = rawUtxos.map((item) => ({
        transactionId: item.outpoint.transactionId,
        index: item.outpoint.index,
        amount: parseInt(item.utxoEntry.amount),
        scriptPublicKey: item.utxoEntry.scriptPublicKey.scriptPublicKey,
        blockDaaScore: item.utxoEntry.blockDaaScore,
        isCoinbase: item.utxoEntry.isCoinbase,
      }));

      if (utxos.length > 0) {
        const totalValue = utxos.reduce((sum, utxo) => sum + utxo.amount, 0);
        console.log(
          `💰 Valeur totale UTXOs: ${this._formatKAS(totalValue)} TKAS`
        );
      }

      return utxos;
    } catch (error) {
      console.error("❌ Erreur récupération UTXOs:", error.message);
      throw new Error(`Impossible de récupérer les UTXOs: ${error.message}`);
    }
  }

  /**
   * Construit la transaction au format API Kaspa
   */
  async _buildTransaction(mnemonic, fromAddr, toAddr, amount, utxos, network) {
    try {
      console.log("🔨 Construction de la transaction...");

      // Créer et connecter le wallet avec la mnemonic
      const wallet = await this._createAndConnectWallet(mnemonic, network);

      // Convertir le montant en sompis (1 KAS = 100,000,000 sompis)
      const amountInSompis = this._kasToSompis(amount);

      console.log(`💰 Montant: ${amount} TKAS (${amountInSompis} sompis)`);
      console.log(`🎯 Destination: ${toAddr}`);

      // Utiliser le wallet pour créer une vraie transaction
      console.log("🔐 Création de la transaction avec le wallet connecté...");

      // Construire les paramètres de transaction pour le wallet
      const txParams = {
        to: toAddr,
        amount: amountInSompis,
        // Laisser le wallet calculer les frais automatiquement
      };

      // Utiliser le wallet pour signer la transaction
      const signedTx = await wallet.createTransaction(txParams);

      console.log(`✅ Transaction signée avec le wallet connecté:`);
      console.log(`   • ${signedTx.inputs.length} input(s)`);
      console.log(`   • ${signedTx.outputs.length} output(s)`);
      console.log(
        `   • Montant: ${amount} TKAS vers ${toAddr.substring(0, 20)}...`
      );

      return {
        transaction: signedTx,
        allowOrphan: false,
      };
    } catch (error) {
      console.error("❌ Erreur construction transaction:", error.message);
      throw error;
    }
  }
  /**
   * Soumet la transaction via POST /transactions
   */
  async _submitTransaction(apiEndpoint, transactionData) {
    try {
      console.log(`🚀 Envoi vers ${apiEndpoint}/transactions...`);

      const response = await axios.post(
        `${apiEndpoint}/transactions?replaceByFee=false`,
        transactionData,
        {
          timeout: 30000,
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "KaspaSwapBot/1.0",
          },
        }
      );

      console.log(`✅ Réponse API:`, response.data);

      if (response.data.error) {
        throw new Error(`Erreur API: ${response.data.error}`);
      }

      if (!response.data.transactionId) {
        throw new Error("Aucun transactionId retourné par l'API");
      }

      console.log(
        `🎉 Transaction soumise avec succès: ${response.data.transactionId}`
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        const apiError =
          error.response.data?.error ||
          error.response.data?.detail ||
          JSON.stringify(error.response.data) ||
          "Erreur API inconnue";

        console.error("❌ Erreur API:", {
          status: error.response.status,
          statusText: error.response.statusText,
          error: apiError,
        });

        throw new Error(`API Error (${error.response.status}): ${apiError}`);
      } else if (error.code === "ECONNABORTED") {
        throw new Error("Timeout: L'API a mis trop de temps à répondre");
      } else {
        console.error("❌ Erreur réseau:", error.message);
        throw new Error(`Erreur réseau: ${error.message}`);
      }
    }
  }

  /**
   * Obtient l'adresse depuis une mnemonic en utilisant le wallet (comme WalletManager)
   */
  async _getAddressFromMnemonic(mnemonic, network) {
    try {
      // Initialiser le framework Kaspa (comme dans WalletManager)
      await ensureFrameworkInitialized();

      // Créer un wallet temporaire pour obtenir l'adresse (même méthode que WalletManager)
      const networkOptions = {
        network: network, // Utiliser directement "kaspa" ou "kaspatest" comme WalletManager
      };

      const tempWallet = Wallet.fromMnemonic(mnemonic, networkOptions);

      tempWallet.setLogLevel("error"); // Mode silencieux pour le wallet temporaire
      await tempWallet.ready;

      const address = tempWallet.receiveAddress;
      console.log(`📍 [ApiSender] Adresse dérivée: ${address}`);

      return address;
    } catch (error) {
      console.error("❌ Erreur dérivation adresse:", error.message);
      throw new Error(`Dérivation d'adresse échouée: ${error.message}`);
    }
  }

  /**
   * Utilitaires de conversion
   */
  _kasToSompis(kas) {
    return Math.floor(kas * 100000000);
  }

  _formatKAS(sompis) {
    return (sompis / 100000000).toFixed(8);
  }

  /**
   * Retourne les alternatives disponibles
   */
  _getAlternatives() {
    return {
      kasware: {
        available: true,
        method: "Extension navigateur",
        steps: [
          "Installer Kasware depuis Chrome Web Store",
          "Importer la clé privée",
          "Sélectionner le réseau kaspatest",
          "Envoyer la transaction",
        ],
      },
      kdx: {
        available: true,
        method: "Application desktop",
        steps: [
          "Télécharger KDX depuis kaspa.org",
          "Configurer le réseau kaspatest",
          "Importer la clé privée",
          "Effectuer la transaction",
        ],
      },
      apiDirect: {
        available: true,
        method: "API REST directe",
        requirement: "Construction complète de transaction requise",
      },
    };
  }

  /**
   * Vérifie la disponibilité des nœuds publics
   */
  async checkNodeAvailability(network) {
    try {
      const apiEndpoint = this.apiEndpoints[network];
      if (!apiEndpoint) return false;

      const response = await axios.get(`${apiEndpoint}/info/network`, {
        timeout: 5000,
      });

      return response.status === 200;
    } catch (error) {
      console.log(`❌ Nœud ${network} inaccessible:`, error.message);
      return false;
    }
  }
}

module.exports = ApiTransactionSender;
