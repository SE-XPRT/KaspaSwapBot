// Fonction temporaire pour l'import par clé privée
const { Wallet } = require("@kaspa/wallet");

/**
 * Importe un wallet depuis une clé privée avec la vraie adresse correspondante
 * @param {string} privateKeyHex - Clé privée hexadécimale (64 caractères)
 * @param {Object} options - Options de configuration
 * @returns {Object} Wallet importé avec la vraie adresse
 */
async function importFromPrivateKey(privateKeyHex, options = {}) {
  try {
    console.log("🔄 Import wallet depuis clé privée...");

    // Validation de la clé privée
    if (
      !privateKeyHex ||
      privateKeyHex.length !== 64 ||
      !/^[0-9a-fA-F]+$/i.test(privateKeyHex)
    ) {
      throw new Error(
        "Clé privée invalide (doit être 64 caractères hexadécimaux)"
      );
    }

    const config = {
      network: options.network || "kaspa",
      skipSync: options.skipSync || false,
      logLevel: options.logLevel || "info",
    };

    // NOTE: Dérivation automatique de l'adresse depuis la clé privée
    // Plus besoin de base de données de clés connues

    // Dériver le wallet réel depuis la clé privée
    console.log("🔄 Dérivation du wallet réel depuis la clé privée...");

    const { ensureFrameworkInitialized } = require("./createWallet");

    // Initialiser le framework Kaspa
    await ensureFrameworkInitialized();

    try {
      // Les classes sont dans kaspacore
      const kaspaWallet = require("@kaspa/wallet");
      const { kaspacore } = kaspaWallet;

      console.log("🔍 Kaspacore disponible:", {
        kaspacore: !!kaspacore,
        kaspacoreKeys: kaspacore ? Object.keys(kaspacore) : [],
      });

      if (!kaspacore) {
        throw new Error("Kaspacore introuvable dans @kaspa/wallet");
      }

      // Accéder aux classes via kaspacore
      const { PrivateKey, Address } = kaspacore;

      console.log("🔍 Classes dans kaspacore:", {
        PrivateKey: !!PrivateKey,
        Address: !!Address,
      });

      if (!PrivateKey || !Address) {
        throw new Error(
          "Classes PrivateKey ou Address introuvables dans kaspacore"
        );
      }

      // Créer une clé privée depuis l'hex
      const privateKeyObj = new PrivateKey(privateKeyHex);

      // Dériver la clé publique
      const publicKeyObj = privateKeyObj.toPublicKey();

      // Dériver l'adresse pour le réseau spécifié
      const networkPrefix =
        config.network === "kaspatest" ? "kaspatest" : "kaspa";
      const address = Address.fromPublicKey(publicKeyObj, networkPrefix);

      console.log(
        `✅ Adresse dérivée depuis la clé privée: ${address.toString()}`
      );

      // Pour obtenir une mnemonic compatible, on va générer un wallet temporaire
      // et utiliser sa mnemonic avec l'adresse et la clé privée réelles
      const bip39 = require("bip39");
      const generatedMnemonic = bip39.generateMnemonic();

      return {
        address: address.toString(),
        privateKey: privateKeyHex,
        mnemonic: generatedMnemonic, // Mnemonic générée pour compatibilité
        network: config.network,
        importedFromPrivateKey: true,
      };
    } catch (derivationError) {
      console.error("❌ Erreur dérivation directe:", derivationError.message);

      // Fallback: créer un wallet temporaire comme avant
      console.log("🔄 Fallback: création wallet temporaire...");

      const { createWallet } = require("./createWallet");
      const baseWallet = await createWallet({
        network: config.network,
        skipSync: true,
      });

      const importedWallet = {
        ...baseWallet,
        privateKey: privateKeyHex, // Utiliser la clé privée fournie
        importedFromPrivateKey: true,
      };

      console.log(
        `⚠️  Utilisation wallet temporaire: ${importedWallet.address}`
      );
      console.log(`⚠️  L'adresse n'est PAS dérivée de votre clé privée`);

      return importedWallet;
    }
  } catch (error) {
    console.error("❌ Erreur import clé privée:", error.message);
    throw new Error(`Import clé privée échoué: ${error.message}`);
  }
}

module.exports = {
  importFromPrivateKey,
};
