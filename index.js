const { Telegraf, message } = require("telegraf");
const dotenv = require("dotenv");
dotenv.config();

const {
  createWallet,
  importWallet,
  exportWallet,

  updateWalletBalance,
} = require("./lib/createWallet.js");

const WalletManager = require("./lib/walletManager.js");
const { importFromPrivateKey } = require("./lib/privateKeyImport.js");
const bot = new Telegraf(process.env.BOT_TOKEN);
const walletManager = new WalletManager();

// Stockage temporaire des sessions utilisateur
const userSessions = new Map();

// Utilitaires
function getUserSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      wallet: null,
      pendingAction: null,
      network: "kaspa", // Réseau par défaut (mainnet)
    });
  }
  return userSessions.get(userId);
}

// Commandes de base
bot.start((ctx) => {
  ctx.reply(
    "🚀 *Kaspa Swap Bot*\n\n" +
      "Fully compatible with *Kasware*, *KDX*, and other Kaspa wallets.\n\n" +
      "Available commands:\n" +
      "• `/generate` - Create a new wallet\n" +
      "• `/import` - Import an existing wallet\n" +
      "• `/balance` - Check your balance\n" +
      "• `/send` - Send KAS\n" +
      "• `/export` - Export your wallet\n" +
      "• `/network` - Switch network\n" +
      "• `/help` - Show detailed help",
    { parse_mode: "Markdown" }
  );
});

bot.help((ctx) => {
  ctx.reply(
    "📖 *User Guide*\n\n" +
      "*Wallet Management:*\n" +
      "• `/generate` - Create a new wallet with a 24-word mnemonic\n" +
      "• `/import` - Import wallet via mnemonic (Kasware/KDX compatible)\n" +
      "• `/export <password>` - Export your encrypted wallet\n\n" +
      "*Operations:*\n" +
      "• `/balance` - Display current balance\n" +
      "• `/send <address> <amount>` - Send KAS tokens\n\n" +
      "*Configuration:*\n" +
      "• `/network <kaspa|kaspatest|kaspadev>` - Switch network\n\n" +
      "*Supported Networks:*\n" +
      "• `kaspa` - Mainnet (default)\n" +
      "• `kaspatest` - Testnet\n" +
      "• `kaspadev` - Devnet\n" +
      "• `kaspasim` - Simnet\n\n" +
      "⚠️ *Always back up your mnemonic phrase!*",
    { parse_mode: "Markdown" }
  );
});

// Generate a new Kaspa wallet

bot.command("generate", async (ctx) => {
  try {
    const session = getUserSession(ctx.from.id);

    await ctx.reply("🔧 Generating your wallet...");

    // Create a new Kaspa wallet
    const wallet = await createWallet({
      network: session.network,
      skipSync: true,
    });

    // Update balance using the same method as /import for consistency
    const updatedWallet = await updateWalletBalance(wallet, {
      network: session.network,
    });

    // Store private key and mnemonic in session
    session.wallet = {
      address: updatedWallet.address,
      privateKey: updatedWallet.privateKey,
      mnemonic: updatedWallet.mnemonic,
      network: updatedWallet.network,
    };

    console.log("✅ Wallet generated for user:", ctx.from.id);
    console.log(`📬 Generated address: ${updatedWallet.address}`);

    const currency = session.network === "kaspatest" ? "TKAS" : "KAS";

    // First message: wallet info with private key
    await ctx.replyWithMarkdown(
      `🎉 *New Kaspa Wallet Created!*\n\n` +
        `🌐 *Network:* ${session.network}\n` +
        `📬 *Address:* \`${updatedWallet.address}\`\n` +
        `🔐 *Private Key:* \`${updatedWallet.privateKey}\`\n` +
        `💰 *Balance:* ${updatedWallet.balance.formatted.total} ${currency}\n\n` +
        `✅ *Compatible with all Kaspa wallets*\n` +
        `⚠️ *IMPORTANT:* Be sure to back up your private key securely!`
    );
  } catch (error) {
    console.error("❌ Wallet generation error:", error.message);
    await ctx.reply(`❌ Error while generating wallet: ${error.message}`);
  }
});

// Import an existing wallet
bot.command("import", async (ctx) => {
  const session = getUserSession(ctx.from.id);
  session.pendingAction = "import";

  await ctx.reply(
    "🔐 *Wallet Import*\n\n" +
      "Please send your private key (hexadecimal string).\n" +
      "Compatible with Kasware, KDX, and other Kaspa wallets.\n\n" +
      "⚠️ *Warning:* Never share your private key with anyone!",
    { parse_mode: "Markdown" }
  );
});
// Remplacer la commande /balance (lignes 149-195)

// Check wallet balance
bot.command("balance", async (ctx) => {
  try {
    const session = getUserSession(ctx.from.id);

    if (!session.wallet || !session.wallet.address) {
      return ctx.reply(
        "❌ No wallet loaded. Use `/generate` or `/import` first."
      );
    }

    await ctx.reply("🔄 Fetching balance...");

    // Utiliser directement l'adresse et la clé privée de la session
    const updatedWallet = await updateWalletBalance(
      {
        address: session.wallet.address,
        privateKey: session.wallet.privateKey,
        network: session.network,
      },
      {
        network: session.network,
      }
    );

    const currency = session.network === "kaspatest" ? "TKAS" : "KAS";

    if (session.network === "kaspa") {
      // Mainnet - API available
      await ctx.replyWithMarkdown(
        `💰 *Wallet Balance*\n\n` +
          `📬 *Address:* \`${session.wallet.address}\`\n` +
          `🌐 *Network:* ${session.network} (Mainnet)\n` +
          `📡 *Source:* ${updatedWallet.balanceSource || "Public API"}\n\n` +
          `💵 *Available:* ${updatedWallet.balance.formatted.available} KAS\n` +
          `⏳ *Pending:* ${updatedWallet.balance.formatted.pending} KAS\n` +
          `📊 *Total:* ${updatedWallet.balance.formatted.total} KAS\n\n` +
          `✅ *Real-time data via public API*`
      );
    } else {
      // Testnet/Devnet - API available too
      await ctx.replyWithMarkdown(
        `💰 *Wallet Balance*\n\n` +
          `📬 *Address:* \`${session.wallet.address}\`\n` +
          `🌐 *Network:* ${session.network} (Testnet)\n` +
          `📡 *Source:* ${updatedWallet.balanceSource || "API"}\n\n` +
          `💵 *Available:* ${updatedWallet.balance.formatted.available} ${currency}\n` +
          `⏳ *Pending:* ${updatedWallet.balance.formatted.pending} ${currency}\n` +
          `📊 *Total:* ${updatedWallet.balance.formatted.total} ${currency}\n\n` +
          `✅ *Real-time data from Kaspa API*`
      );
    }
  } catch (error) {
    console.error("❌ Balance check error:", error.message);
    await ctx.reply(`❌ Error while checking balance: ${error.message}`);
  }
});
// Send KAS transaction using privateKey
bot.command("send", async (ctx) => {
  const session = getUserSession(ctx.from.id);

  if (!session.wallet || !session.wallet.privateKey) {
    return ctx.reply(
      "❌ No wallet loaded. Please use `/generate` or `/import` first."
    );
  }

  const args = ctx.message.text.split(" ").slice(1);

  if (args.length < 2) {
    const currency = session.network === "kaspatest" ? "TKAS" : "KAS";
    return ctx.reply(
      `📤 *Send ${currency}*\n\n` +
        `Usage: \`/send <address> <amount>\`\n\n` +
        `Examples:\n` +
        `• \`/send kaspa:qz... 1.5\` (mainnet)\n` +
        `• \`/send kaspatest:qq... 10\` (testnet)\n\n` +
        `⚠️ *Double-check the address and selected network!*`,
      { parse_mode: "Markdown" }
    );
  }

  try {
    const [toAddress, amount] = args;
    const amountFloat = parseFloat(amount);

    if (isNaN(amountFloat) || amountFloat <= 0) {
      return ctx.reply("❌ Invalid amount. Use a positive number.");
    }

    if (!toAddress.includes(":") || toAddress.length < 20) {
      return ctx.reply(
        "❌ Invalid address format. It must include a network prefix (e.g., kaspa:, kaspatest:)."
      );
    }

    const addressNetwork = toAddress.split(":")[0];
    if (addressNetwork !== session.network) {
      return ctx.reply(
        `❌ Network mismatch!\n\n` +
          `• Current network: \`${session.network}\`\n` +
          `• Address network: \`${addressNetwork}\`\n\n` +
          `Switch with \`/network ${addressNetwork}\` or use an address with the \`${session.network}:\` prefix.`,
        { parse_mode: "Markdown" }
      );
    }

    await ctx.reply("🔍 Checking balance...");

    const updatedWallet = await updateWalletBalance(
      {
        address: session.wallet.address,
        network: session.network,
        privateKey: session.wallet.privateKey,
      },
      { network: session.network }
    );

    const currentBalance = parseFloat(updatedWallet.balance.formatted.total);
    const estimatedFee = 0.001;
    const totalNeeded = amountFloat + estimatedFee;

    if (currentBalance < totalNeeded) {
      const currency = session.network === "kaspatest" ? "TKAS" : "KAS";
      return ctx.replyWithMarkdown(
        `❌ *Insufficient balance*\n\n` +
          `• Current: ${currentBalance} ${currency}\n` +
          `• Sending: ${amountFloat} ${currency}\n` +
          `• Estimated fee: ${estimatedFee} ${currency}\n` +
          `• Required: ${totalNeeded} ${currency}\n\n` +
          `Missing: ${(totalNeeded - currentBalance).toFixed(8)} ${currency}`
      );
    }

    await ctx.reply("🚀 Sending transaction...");

    try {
      console.log("🚀 Starting transaction...");
      console.log(
        `📤 Sending ${amountFloat} ${
          session.network === "kaspatest" ? "TKAS" : "KAS"
        } to ${toAddress}`
      );

      const result = await walletManager.sendTransactionWithPrivateKey(
        session.wallet.privateKey,
        {
          toAddr: toAddress,
          amount: amountFloat,
          options: {
            network: session.network,
          },
        }
      );

      console.log("📥 Transaction result:", result);

      const currency = session.network === "kaspatest" ? "TKAS" : "KAS";

      if (result.success) {
        await ctx.replyWithMarkdown(
          `✅ *Transaction Successful!*\n\n` +
            `🆔 *Transaction ID:* \`${result.txid}\`\n` +
            `📤 *From:* \`${result.from}\`\n` +
            `📥 *To:* \`${result.to}\`\n` +
            `💰 *Amount:* ${result.amount} ${currency}\n` +
            `💸 *Fee:* ${result.fee} ${currency}\n` +
            `🌐 *Network:* ${session.network}\n\n` +
            `🔍 *Status:* Confirmed on the blockchain\n` +
            `✅ *Securely sent using your private key*\n` +
            `📅 *Timestamp:* ${new Date().toLocaleString("en-US")}`
        );

        // Update balance after sending
        setTimeout(async () => {
          try {
            const newBalance = await updateWalletBalance(
              {
                address: session.wallet.address,
                network: session.network,
                privateKey: session.wallet.privateKey,
              },
              { network: session.network }
            );

            await ctx.reply(
              `💰 *Updated Balance:* ${newBalance.balance.formatted.total} ${currency}`
            );
          } catch (e) {
            console.log("⚠️ Error updating balance after sending:", e.message);
          }
        }, 5000);
      } else {
        await ctx.reply(
          `❌ Transaction failed: ${result.error || "Unknown error"}`
        );
      }
    } catch (txError) {
      console.error("❌ Transaction error:", txError.message);

      let errorMessage = txError.message;
      let suggestions = "";

      if (errorMessage.includes("wallet load failed")) {
        suggestions =
          `💡 *Suggestions:*\n` +
          `• Make sure your local Kaspa node is running\n` +
          `• Port for ${session.network}: ${
            session.network === "kaspa"
              ? "16110"
              : session.network === "kaspatest"
              ? "16210"
              : "16310"
          }\n` +
          `• Or use Kasware/KDX for manual sending`;
      } else if (errorMessage.includes("insufficient")) {
        suggestions =
          `💡 *Suggestions:*\n` +
          `• Check your balance with \`/balance\`\n` +
          `• Wait for previous transactions to confirm`;
      } else if (
        errorMessage.includes("connection") ||
        errorMessage.includes("timeout")
      ) {
        suggestions =
          `💡 *Suggestions:*\n` +
          `• Check your internet connection\n` +
          `• Make sure your local Kaspa node is online\n` +
          `• As an alternative, try Kasware or KDX`;
      } else {
        suggestions =
          `💡 *Alternatives:*\n` +
          `*Option 1 – Kasware (Recommended):*\n` +
          `• Use \`/export\` to export your wallet\n` +
          `• Import it into Kasware to send manually\n\n` +
          `*Option 2 – KDX Wallet:*\n` +
          `• Import your mnemonic\n` +
          `• Send directly from the desktop app`;
      }

      await ctx.replyWithMarkdown(
        `❌ *Transaction failed*\n\n` + `${errorMessage}\n\n` + suggestions
      );
    }
  } catch (error) {
    console.error("❌ Global send error:", error.message);
    await ctx.reply(`❌ Error during transaction: ${error.message}`);
  }
});

// Vérification du statut d'une transaction
bot.command("status", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1);
  const session = getUserSession(ctx.from.id);

  if (args.length === 0) {
    return ctx.reply(
      "🔍 *Vérification de transaction*\n\n" +
        "Usage : `/status <transaction_id>`\n\n" +
        "Exemple : `/status 1a2b3c...`",
      { parse_mode: "Markdown" }
    );
  }

  try {
    const txid = args[0];

    await ctx.reply("🔍 Vérification du statut de la transaction...");

    const status = await apiSender.getTransactionStatus(txid, session.network);

    await ctx.replyWithMarkdown(
      `📊 *Statut de la transaction*\n\n` +
        `🆔 *ID :* \`${status.txid}\`\n` +
        `🔍 *Statut :* ${status.status}\n` +
        `✅ *Confirmations :* ${status.confirmations}\n` +
        `🌐 *Réseau :* ${status.network}\n` +
        `📡 *Méthode :* ${status.method}`
    );
  } catch (error) {
    console.error("❌ Erreur statut :", error.message);
    await ctx.reply(`❌ Erreur lors de la vérification : ${error.message}`);
  }
});

// Switch Kaspa network
bot.command("network", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1);
  const session = getUserSession(ctx.from.id);

  if (args.length === 0) {
    return ctx.reply(
      `🌐 *Current network:* \`${session.network}\`\n\n` +
        "*Available networks:*\n" +
        "• `kaspa` - Mainnet\n" +
        "• `kaspatest` - Testnet\n" +
        "• `kaspadev` - Devnet\n" +
        "• `kaspasim` - Simnet\n\n" +
        "Usage: `/network <network_name>`",
      { parse_mode: "Markdown" }
    );
  }

  const newNetwork = args[0].toLowerCase();
  const validNetworks = ["kaspa", "kaspatest", "kaspadev", "kaspasim"];

  if (!validNetworks.includes(newNetwork)) {
    return ctx.reply(
      `❌ Invalid network. Use one of: ${validNetworks.join(", ")}`
    );
  }

  session.network = newNetwork;
  await ctx.reply(`✅ Network switched to: \`${newNetwork}\``, {
    parse_mode: "Markdown",
  });
});

/// Export wallet - simple private key export
bot.command("export", async (ctx) => {
  const session = getUserSession(ctx.from.id);

  if (!session.wallet || !session.wallet.privateKey) {
    return ctx.reply(
      "❌ No wallet loaded. Use `/generate` or `/import` first."
    );
  }

  try {
    await ctx.replyWithMarkdown(
      `🔐 *Wallet Export*\n\n` +
        `📬 *Address:* \`${session.wallet.address}\`\n` +
        `🌐 *Network:* ${session.network}\n` +
        `🔐 *Private Key:* \`${session.wallet.privateKey}\`\n\n` +
        `⚠️ *IMPORTANT:* Save this private key in a secure place!\n` +
        `✅ *Compatible with Kasware, KDX, and all Kaspa wallets*`
    );
  } catch (error) {
    console.error("❌ Export error:", error.message);
    await ctx.reply(`❌ Error during export: ${error.message}`);
  }
});
// Guide: how to use external wallets
bot.command("howto", async (ctx) => {
  await ctx.replyWithMarkdown(
    `🔐 *How to Send Real Transactions*\n\n` +
      `This bot can generate and manage your Kaspa wallets, but to send *real* transactions securely, we recommend:\n\n` +
      `*🟢 KASWARE (Recommended):*\n` +
      `1. Install the Kasware browser extension (Chrome/Edge)\n` +
      `2. Use \`/export <password>\` in this bot\n` +
      `3. In Kasware: "Import Wallet" > Paste the encrypted string\n` +
      `4. Enter your password\n` +
      `5. Send KAS/TKAS securely\n\n` +
      `*🟢 KDX WALLET:*\n` +
      `1. Download KDX Desktop from kaspa.org\n` +
      `2. Choose "Import Wallet" > Enter your 24-word mnemonic\n` +
      `3. Select the appropriate network (mainnet/testnet)\n` +
      `4. Manage and send your funds\n\n` +
      `*🟢 OTHER COMPATIBLE WALLETS:*\n` +
      `• Tangem Wallet (with Kaspa support)\n` +
      `• OneKey Wallet\n` +
      `• Any wallet that supports Kaspa\n\n` +
      `💡 *Why use this bot?*\n` +
      `✅ Secure wallet generation\n` +
      `✅ Real-time balance tracking\n` +
      `✅ Compatible with all Kaspa wallets\n` +
      `✅ Easy import/export\n` +
      `✅ Multi-network management\n\n` +
      `⚠️ *Important:* Always back up your mnemonic and passwords securely!`
  );
});
// Handle wallet import from text (mnemonic or private key)
bot.on("text", async (ctx) => {
  const session = getUserSession(ctx.from.id);

  if (session.pendingAction === "import") {
    try {
      const input = ctx.message.text.trim();
      let wallet;

      // Detect if it's a private key or a mnemonic
      if (input.length === 64 && /^[0-9a-fA-F]+$/.test(input)) {
        // Private key (64-character hex string)
        await ctx.reply("🔄 Importing from private key...");

        // TODO: Implement importFromPrivateKey in createWallet.js
        wallet = await importFromPrivateKey(input, {
          network: session.network,
          skipSync: true,
        });
      } else {
        // Possibly a mnemonic
        const words = input.split(" ");
        if (words.length !== 12 && words.length !== 24) {
          return ctx.reply(
            "❌ Invalid format. Please provide a 12/24-word mnemonic or a 64-character private key (hex)."
          );
        }

        await ctx.reply("🔄 Importing from mnemonic...");

        wallet = await importWallet(input, {
          network: session.network,
          skipSync: true,
        });
      }

      // Update balance right after import
      const updatedWallet = await updateWalletBalance(wallet, {
        network: session.network,
      });

      // Store mnemonic and private key in session
      session.wallet = {
        address: updatedWallet.address,
        privateKey: updatedWallet.privateKey,
        mnemonic: updatedWallet.mnemonic || input, // Utiliser la mnemonic du wallet importé ou l'input si c'est une mnemonic
        network: updatedWallet.network,
      };
      session.pendingAction = null;

      // Attempt to delete the message for security
      try {
        await ctx.deleteMessage();
      } catch (e) {
        // Ignore if bot lacks delete permissions
      }

      const currency = session.network === "kaspatest" ? "TKAS" : "KAS";

      await ctx.replyWithMarkdown(
        `✅ *Wallet successfully imported!*\n\n` +
          `📬 *Address:* \`${updatedWallet.address}\`\n` +
          `🌐 *Network:* ${session.network}\n` +
          `🔐 *Private Key:* \`${updatedWallet.privateKey}\`\n` +
          `💰 *Balance:* ${updatedWallet.balance.formatted.total} ${currency}\n\n` +
          `🔐 *Import message deleted for your security.*\n` +
          `✅ *Ready to send transactions*`
      );
    } catch (error) {
      console.error("❌ Import error:", error.message);
      session.pendingAction = null;
      await ctx.reply(`❌ Error during import: ${error.message}`);
    }
  }
});

// Lancement du bot
bot
  .launch()
  .then(() => {
    console.log("✅ Kaspa Swap Bot démarré avec succès");
    console.log("🔧 Fonctionnalités disponibles :");
    console.log("   • Génération de wallets (24 mots)");
    console.log("   • Import/Export compatible Kasware/KDX");
    console.log("   • Support multi-réseaux (mainnet/testnet/devnet)");
    console.log("   • Transactions sécurisées");
    console.log("   • Gestion avancée des balances");
  })
  .catch((error) => {
    console.error("❌ Échec du démarrage du bot:", error);
  });

// Arrêt propre du bot et déchargement des wallets
const gracefulShutdown = async (signal) => {
  console.log(`\n📤 Arrêt du bot (${signal})...`);

  try {
    await walletManager.unloadAllWallets();
    console.log("✅ Tous les wallets déchargés");
  } catch (error) {
    console.error("❌ Erreur lors du déchargement des wallets:", error);
  }

  bot.stop(signal);
  process.exit(0);
};

process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
