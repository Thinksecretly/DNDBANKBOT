require('dotenv').config();
const apiKey = process.env.API_KEY;

const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Load or initialize bank data
const bankFile = './bank.json';
let bank = {};

if (fs.existsSync(bankFile)) {
    bank = JSON.parse(fs.readFileSync(bankFile));
}

const logFile = './transaction_log.json';
let logs = [];

if (fs.existsSync(logFile)) {
    logs = JSON.parse(fs.readFileSync(logFile));
}

// Subscription prices
const subscriptionPrices = {
    "WizFi": 15,
    "Starscrolls Coffee": 10,
    "Owlbear Outfitters": 12,
    "Bardify": 8,
    "GlamourGram": 10,
    "MagiMail": 5,
    "DungeonDrive-Thru": 7,
    "AppTome": 6,
    "RunUber": 10,
    "Wandify": 8,
    "Spellfie Stick": 5,
    "Mystical Market": 12,
    "PayParchment": 5,
    "AirBnB": 15,
    "TomeHub": 8,
    "FitMage": 6,
    "Mithrilbucks": 10,
    "Eldritch Electronics": 12,
    "Gnomazon": 14,
    "Wight-Mart": 9,
    "Merlin & Sachs": 15,
    "Draconic Drive-thrus": 12,
    "ArcaneMall": 10,
    "Potion Depot": 14,
    "NecroNet": 10
};

// Black Market Items
const blackMarketItems = [
    { name: "Shadow Cloak", description: "Grants advantage on stealth checks. One-time use.", cost: 50 },
    { name: "Vial of Nightshade", description: "Adds poison damage to the next attack. One-time use.", cost: 75 },
    { name: "Arcane Lockpick", description: "Opens magically sealed doors. One-time use.", cost: 100 },
    { name: "Scroll of Fireball", description: "Casts Fireball (level 3). One-time use.", cost: 120 },
    { name: "Ring of Invisibility", description: "Grants invisibility for one turn. One-time use.", cost: 150 },
    { name: "Phoenix Feather", description: "Revives the bearer with half health. One-time use.", cost: 200 },
    { name: "Veto Coin of Fate", description: "Veto one DM decision before the outcome is revealed. One-time use.", cost: 500 }
];

let currentMarket = [];
const DM_ID = '142856092379119616'; // Replace with your Discord ID
const CHANNEL_ID = '1305904608178077727'; // Replace with your preferred announcement channel ID
const BANK_ANNOUNCEMENTS_CHANNEL = '1306298868169707600'; // Replace with your actual bank announcements channel ID

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

function saveBank() {
    fs.writeFileSync(bankFile, JSON.stringify(bank, null, 2));
}

function logTransaction(playerID, description) {
    logs.push({
        player: bank[playerID].username,
        balance: bank[playerID].balance,
        description: description,
        timestamp: new Date().toISOString()
    });
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

function rotateBlackMarket() {
    currentMarket = blackMarketItems.sort(() => 0.5 - Math.random()).slice(0, 3);
    client.channels.cache.get(CHANNEL_ID).send(
        `📜 **New Black Market Items Available!** 📜\n` +
        currentMarket.map(item => `**${item.name}** - ${item.description} | Cost: ${item.cost} gold`).join('\n')
    );
}

function applyInterest(player) {
    if (player.balance < 0) {
        const interest = Math.ceil(player.balance * 0.05);
        player.balance += interest; // Interest is added as a negative number, increasing the debt
        logTransaction(player.username, `5% interest applied: ${interest} gold.`);
    }
}

function performSessionTasks() {
    const balanceReport = [];
    for (const playerID in bank) {
        const player = bank[playerID];
        let totalCost = 0;

        player.subscriptions.forEach(sub => {
            totalCost += subscriptionPrices[sub];
        });

        player.balance -= totalCost;
        applyInterest(player);
        logTransaction(playerID, `Charged ${totalCost} gold for subscriptions.`);

        balanceReport.push(`${player.username}: ${player.balance} gold`);
    }

    rotateBlackMarket();
    saveBank();

    client.channels.cache.get(BANK_ANNOUNCEMENTS_CHANNEL).send(
        `💰 **Player Balances at Session Start** 💰\n` + balanceReport.join('\n')
    );
    client.channels.cache.get(CHANNEL_ID).send('A new session has started! Subscriptions charged, and black market refreshed.');
}

client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const playerID = message.author.id;

    if (!bank[playerID]) {
        bank[playerID] = { username: message.author.username, balance: 100, subscriptions: [], inventory: [] };
        saveBank();
        message.channel.send(`Account created for ${message.author.username} with 100 gold.`);
    }

    if (command === 'newsession' && message.author.id === DM_ID) {
        performSessionTasks();
    }

    if (command === 'balance') {
        message.channel.send(`${bank[playerID].username}, your balance is ${bank[playerID].balance} gold.`);
    }

    if (command === 'subscriptions') {
        const subs = bank[playerID].subscriptions;
        message.channel.send(subs.length ? `Your active subscriptions: ${subs.join(', ')}` : `You have no active subscriptions.`);
    }

    if (command === 'blackmarket') {
        message.channel.send(
            currentMarket.length
                ? `📜 **Current Black Market Items** 📜\n` +
                  currentMarket.map(item => `**${item.name}** - ${item.description} | Cost: ${item.cost} gold`).join('\n')
                : "The black market is empty. Check back later!"
        );
    }

    if (command === 'buy') {
        const itemName = args.join(' ');
        const item = currentMarket.find(i => i.name.toLowerCase() === itemName.toLowerCase());

        if (!item) {
            message.channel.send("That item isn't available in the black market right now.");
            return;
        }

        if (bank[playerID].balance < item.cost) {
            message.channel.send(`You don't have enough gold to buy **${item.name}**. It costs ${item.cost} gold.`);
            return;
        }

        bank[playerID].balance -= item.cost;
        bank[playerID].inventory.push(item.name);
        logTransaction(playerID, `Purchased ${item.name} for ${item.cost} gold.`);
        saveBank();
        message.channel.send(`${bank[playerID].username} successfully purchased **${item.name}** for ${item.cost} gold! Remaining balance: ${bank[playerID].balance} gold.`);
    }

    if (command === 'inventory') {
        const inventory = bank[playerID].inventory;
        message.channel.send(inventory.length ? `👜 **${bank[playerID].username}'s Inventory**: ${inventory.join(', ')}` : `Your inventory is empty.`);
    }
});

client.login(apiKey);
