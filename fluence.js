const axios = require('axios');
const { ethers } = require('ethers');
const prompt = require('prompt-sync')({ sigint: true });
const fs = require('fs').promises;
const UserAgent = require('user-agents');
const { HttpsProxyAgent } = require('https-proxy-agent');

const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  bold: "\x1b[1m"
};

const logger = {
  info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[⚠] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[➤] ${msg}${colors.reset}`),
  banner: () => {
    console.log(`${colors.cyan}${colors.bold}`);
    console.log(`---------------------------------------------`);
    console.log(`  Pointless Auto Bot - Airdrop Insiders  `);
    console.log(`---------------------------------------------${colors.reset}`);
    console.log();
  }
};

const getRandomUserAgent = () => {
  const userAgent = new UserAgent({ deviceCategory: 'desktop' });
  return userAgent.toString();
};

async function readProxies() {
  try {
    const data = await fs.readFile('proxies.txt', 'utf8');
    const proxies = data.split('\n').map(line => line.trim()).filter(line => line);
    if (proxies.length === 0) {
      logger.warn('proxies.txt is empty or not found. Running without proxies.');
      return [];
    }
    logger.info(`Loaded ${proxies.length} proxies from proxies.txt`);
    return proxies;
  } catch (error) {
    logger.warn(`Failed to read proxies.txt: ${error.message}. Running without proxies.`);
    return [];
  }
}

function getRandomProxy(proxies) {
  if (proxies.length === 0) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

function createProxyAgent(proxy) {
  if (!proxy) return null;
  try {
    return new HttpsProxyAgent(proxy);
  } catch (error) {
    logger.error(`Invalid proxy format: ${proxy}`);
    return null;
  }
}

const getHeaders = (accessToken = null) => {
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.7',
    'content-type': 'application/json',
    'priority': 'u=1, i',
    'sec-ch-ua': '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'sec-gpc': '1',
    'Referer': 'https://pointless.fluence.network/',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'User-Agent': getRandomUserAgent()
  };
  if (accessToken) {
    headers['authorization'] = `Bearer ${accessToken}`;
  }
  return headers;
};

async function readReferralCode() {
  try {
    const data = await fs.readFile('code.txt', 'utf8');
    const referralCode = data.trim();
    if (!referralCode) throw new Error('Referral code is empty');
    logger.info(`Referral code loaded: ${referralCode}`);
    return referralCode;
  } catch (error) {
    logger.error(`Failed to read code.txt: ${error.message}`);
    process.exit(1);
  }
}

async function saveWallet(walletData) {
  try {
    let wallets = [];
    try {
      const data = await fs.readFile('wallets.json', 'utf8');
      wallets = JSON.parse(data);
    } catch (error) {
     
    }
    wallets.push(walletData);
    await fs.writeFile('wallets.json', JSON.stringify(wallets, null, 2));
    logger.success(`Wallet saved: ${walletData.address}`);
  } catch (error) {
    logger.error(`Failed to save wallet: ${error.message}`);
  }
}

async function getNonce(walletAddress, proxy) {
  try {
    logger.loading(`Fetching nonce for wallet: ${walletAddress} ${proxy ? `using proxy: ${proxy}` : ''}`);
    const response = await axios.post(
      'https://pointless-api.fluence.network/api/v1/auth/nonce',
      { walletAddress },
      {
        headers: getHeaders(),
        httpsAgent: createProxyAgent(proxy)
      }
    );
    if (response.data.success) {
      logger.info(`Nonce received: ${response.data.data.nonce}`);
      return response.data.data.nonce;
    }
    throw new Error('Failed to get nonce');
  } catch (error) {
    logger.error(`Error fetching nonce: ${error.message}`);
    throw error;
  }
}

async function verifyWallet(wallet, nonce, proxy) {
  try {
    logger.loading(`Signing message for wallet: ${wallet.address}`);
    const signature = await wallet.signMessage(nonce);
    logger.info(`Message signed for wallet: ${wallet.address}`);

    const response = await axios.post(
      'https://pointless-api.fluence.network/api/v1/auth/verify',
      { walletAddress: wallet.address, signature },
      {
        headers: getHeaders(),
        httpsAgent: createProxyAgent(proxy)
      }
    );
    if (response.data.success) {
      logger.success(`Wallet verified: ${wallet.address}`);
      return response.data.data.accessToken;
    }
    throw new Error('Verification failed');
  } catch (error) {
    logger.error(`Error verifying wallet: ${error.message}`);
    throw error;
  }
}

async function applyReferralCode(accessToken, referralCode, proxy) {
  try {
    logger.loading(`Applying referral code: ${referralCode} ${proxy ? `using proxy: ${proxy}` : ''}`);
    const response = await axios.post(
      'https://pointless-api.fluence.network/api/v1/referrals/apply',
      { referralCode },
      {
        headers: getHeaders(accessToken),
        httpsAgent: createProxyAgent(proxy)
      }
    );
    if (response.data.success) {
      logger.success(`Referral code applied successfully`);
      return true;
    }
    throw new Error('Failed to apply referral code');
  } catch (error) {
    logger.error(`Error applying referral code: ${error.message}`);
    return false;
  }
}

async function getTasks(accessToken, walletAddress, proxy) {
  try {
    logger.loading(`Fetching tasks for wallet: ${walletAddress} ${proxy ? `using proxy: ${proxy}` : ''}`);
    const response = await axios.get(
      `https://pointless-api.fluence.network/api/v1/points/${walletAddress.toLowerCase()}`,
      {
        headers: getHeaders(accessToken),
        httpsAgent: createProxyAgent(proxy)
      }
    );
    if (response.data.success) {
      logger.info(`Tasks fetched for wallet: ${walletAddress}`);
      return response.data.data.activities;
    }
    throw new Error('Failed to fetch tasks');
  } catch (error) {
    logger.error(`Error fetching tasks: ${error.message}`);
    return null;
  }
}

async function completeTask(accessToken, activityId, proxy) {
  try {
    logger.loading(`Completing task ID: ${activityId} ${proxy ? `using proxy: ${proxy}` : ''}`);
    const response = await axios.post(
      'https://pointless-api.fluence.network/api/v1/verify',
      { activityId },
      {
        headers: getHeaders(accessToken),
        httpsAgent: createProxyAgent(proxy)
      }
    );
    if (response.data.success) {
      logger.success(`Task ${activityId} completed: ${response.data.data.pointsAwarded} points awarded`);
      return true;
    }
    throw new Error(`Failed to complete task ${activityId}`);
  } catch (error) {
    logger.error(`Error completing task ${activityId}: ${error.message}`);
    return false;
  }
}

async function processWallet(referralCode, walletIndex, proxies) {
  try {
    logger.step(`Processing wallet ${walletIndex + 1}\n`);

    const proxy = getRandomProxy(proxies);
    logger.info(`Using proxy: ${proxy || 'None'}`);

    const wallet = ethers.Wallet.createRandom();
    const walletData = {
      address: wallet.address,
      privateKey: wallet.privateKey
    };
    await saveWallet(walletData);
    logger.info(`New wallet created: ${wallet.address}`);

    const nonce = await getNonce(wallet.address, proxy);

    const accessToken = await verifyWallet(wallet, nonce, proxy);

    await applyReferralCode(accessToken, referralCode, proxy);

    const tasksData = await getTasks(accessToken, wallet.address, proxy);
    if (!tasksData) return;

    const allTasks = [
      ...(tasksData.daily || []),
      ...(tasksData.oneTime || []),
      ...(tasksData.pointless || []),
      ...(tasksData.earning || [])
    ];

    for (const task of allTasks) {
      if (task.status === 'pending') {
        await completeTask(accessToken, task.id, proxy);
      } else {
        logger.info(`Task ${task.id} (${task.title}) already completed or not applicable`);
      }
    }

    logger.success(`Wallet ${walletIndex + 1} processing completed`);
  } catch (error) {
    logger.error(`Error processing wallet ${walletIndex + 1}: ${error.message}`);
  }
}

async function main() {
  logger.banner();

  const referralCode = await readReferralCode();

  const proxies = await readProxies();

  const numWallets = parseInt(prompt('Enter the number of wallets to create and register: '));
  if (isNaN(numWallets) || numWallets <= 0) {
    logger.error('Invalid number of wallets');
    return;
  }
  logger.info(`Starting process for ${numWallets} wallet(s)`);

  for (let i = 0; i < numWallets; i++) {
    await processWallet(referralCode, i, proxies);
  }

  logger.success('All wallets processed successfully');
}

main().catch(error => {
  logger.error(`Script failed: ${error.message}`);
});