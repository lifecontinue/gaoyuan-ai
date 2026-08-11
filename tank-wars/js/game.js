const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const startScreen = document.getElementById('start-screen');
const shopScreen = document.getElementById('shop-screen');
const bankScreen = document.getElementById('bank-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const uiLayer = document.getElementById('ui-layer');
const toastContainer = document.getElementById('toast-container');

const healthFill = document.getElementById('health-fill');
const fuelFill = document.getElementById('fuel-fill');
const healthText = document.getElementById('health-text');
const fuelText = document.getElementById('fuel-text');
const moneyText = document.getElementById('money-text');
const bankText = document.getElementById('bank-text');
const shopMoney = document.getElementById('shop-money');
const bankMoney = document.getElementById('bank-money');
const bankBalanceText = document.getElementById('bank-balance');
const gameOverReason = document.getElementById('game-over-reason');
const statusText = document.getElementById('status-text');

const VIEW_WIDTH = canvas.width;
const VIEW_HEIGHT = canvas.height;
const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 1600;

const keys = Object.create(null);
let gameState = 'start';
let player = null;
let enemies = [];
let allies = [];
let bullets = [];
let particles = [];
let floatTexts = [];
let worldProps = [];
let buildings = [];
let roadSegments = [];
let camera = { x: 0, y: 0 };
let interactionTarget = null;
let money = 0;
let bankBalance = 0;
let spawnTimer = 0;
let infoMessage = '⬆️⬇️⬅️➡️ 方向键移动 · 🚀Space 攻击 · 🛒靠近建筑点击互动';
let infoMessageTimer = 0;
let gameOverMessage = '你的坦克已经被击毁。';
let screenShake = 0;
let screenShakeX = 0;
let screenShakeY = 0;
let refuelState = {
    active: false,
    buildingId: null,
    progress: 0,
    chargeTime: 100,
    fuelPerCharge: 16
};

// === Toast notification system (max 2 visible) ===
const MAX_TOASTS = 2;

function showToast(message, type = 'info') {
    // Remove oldest toasts if exceeding limit
    // NOTE: querySelectorAll returns a STATIC NodeList, so we count via children
    while (toastContainer.children.length >= MAX_TOASTS) {
        toastContainer.firstChild.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    toast.addEventListener('animationend', (e) => {
        if (e.animationName === 'toastOut') {
            toast.remove();
        }
    });
}

// === Screen shake ===
function triggerShake(intensity = 4) {
    screenShake = Math.max(screenShake, intensity);
}

// === Float text ===
function spawnFloatText(x, y, text, color = '#facc15') {
    floatTexts.push({ x, y, text, color, life: 40, maxLife: 40 });
}

// === Particle burst ===
function spawnParticles(x, y, count, color, speed = 3) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = speed * (0.4 + Math.random() * 0.6);
        particles.push({
            x, y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            life: 25 + Math.random() * 20,
            maxLife: 45,
            color,
            radius: 2 + Math.random() * 3
        });
    }
}

const BUILDING_TYPES = {
    shop: {
        label: '商店',
        signColor: '#ec4899',
        roofColor: '#fbcfe8',
        wallColor: '#9d4b7c',
        prompt: '点击进入商店 🛒'
    },
    gas: {
        label: '加油站',
        signColor: '#facc15',
        roofColor: '#fef3c7',
        wallColor: '#b45309',
        prompt: '点击开始加油 ⛽'
    },
    bank: {
        label: '银行',
        signColor: '#3b82f6',
        roofColor: '#dbeafe',
        wallColor: '#2563eb',
        prompt: '点击进入银行 🏦'
    }
};

const ABILITIES = {
    KeyQ: { name: '连发', cooldown: 180 },
    KeyW: { name: '散射', cooldown: 260 },
    KeyE: { name: '护盾', cooldown: 360 },
    KeyR: { name: '穿甲炮', cooldown: 480 }
};

document.querySelectorAll('.tank-card').forEach((card) => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.tank-card').forEach((item) => item.classList.remove('selected'));
        card.classList.add('selected');
    });
});

window.addEventListener('keydown', (event) => {
    keys[event.code] = true;

    if (gameState === 'playing' && ABILITIES[event.code] && !event.repeat) {
        useAbility(event.code);
    }

    if (gameState === 'playing' && event.code === 'Escape' && refuelState.active) {
        cancelRefuel('已停止加油。');
    }
});

window.addEventListener('keyup', (event) => {
    keys[event.code] = false;
});

canvas.addEventListener('click', () => {
    if (gameState !== 'playing' || !interactionTarget) {
        return;
    }

    if (interactionTarget.type === 'shop') {
        openShop();
    } else if (interactionTarget.type === 'bank') {
        openBank();
    } else if (interactionTarget.type === 'gas') {
        startRefuel(interactionTarget);
    }
});

document.getElementById('start-btn').addEventListener('click', () => {
    const selected = document.querySelector('.tank-card.selected');
    startGame(selected ? selected.dataset.type : 'balanced');
});

document.getElementById('restart-btn').addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    uiLayer.classList.add('hidden');
    shopScreen.classList.add('hidden');
    bankScreen.classList.add('hidden');
    gameState = 'start';
});

document.getElementById('close-shop-btn').addEventListener('click', closePanels);
document.getElementById('close-bank-btn').addEventListener('click', closePanels);

document.querySelectorAll('.shop-btn').forEach((button) => {
    button.addEventListener('click', () => {
        buyItem(button.dataset.item);
    });
});

document.getElementById('deposit-btn').addEventListener('click', () => {
    if (money < 50) {
        setInfoMessage('随身金币不足，无法存入。', 140);
        showToast('💰 金币不足！', 'warn');
        return;
    }
    money -= 50;
    bankBalance += 50;
    syncPanels();
    updateUI();
    setInfoMessage('已存入 50 金币。', 140);
    showToast('📥 存入 50 💰', 'info');
});

document.getElementById('withdraw-btn').addEventListener('click', () => {
    if (bankBalance < 50) {
        setInfoMessage('银行余额不足，无法取出。', 140);
        showToast('🏦 余额不足！', 'warn');
        return;
    }
    bankBalance -= 50;
    money += 50;
    syncPanels();
    updateUI();
    setInfoMessage('已取出 50 金币。', 140);
    showToast('📤 取出 50 💰', 'info');
});

class Tank {
    constructor(x, y, type, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.width = 44;
        this.height = 44;
        this.type = type;
        this.isPlayer = isPlayer;
        this.team = isPlayer ? 'friendly' : 'enemy';
        this.isCompanion = false;
        this.converted = false;
        this.color = isPlayer ? '#4ade80' : '#6b7280';
        this.barrelLen = 20;
        this.turretR = 12;
        this.trailColor = null;
        this.moving = false;
        this.speed = 3.1;
        this.maxHealth = 130;
        this.health = 130;
        this.maxFuel = 100;
        this.fuel = 100;
        this.attackDamage = 18;
        this.baseCooldown = 22;
        this.shootCooldown = 0;
        this.angle = -Math.PI / 2;
        this.shieldTimer = 0;
        this.flashTimer = 0;
        this.abilityCooldowns = {
            KeyQ: 0,
            KeyW: 0,
            KeyE: 0,
            KeyR: 0
        };
        this.queuedBursts = [];
        this.aiTimer = 0;
        this.aiTargetAngle = 0;
        this.followDistance = 120;

        if (type === 'heavy') {
            this.width = 52; this.height = 52;
            this.barrelLen = 28;
            this.turretR = 15;
            this.speed = 1.9;
            this.maxHealth = 220;
            this.health = 220;
            this.attackDamage = 32;
            this.baseCooldown = 34;
            if (isPlayer) {
                this.color = '#3b82f6';
            }
        } else if (type === 'speed') {
            this.width = 36; this.height = 36;
            this.barrelLen = 14;
            this.turretR = 9;
            this.speed = 5.2;
            this.maxHealth = 70;
            this.health = 70;
            this.attackDamage = 12;
            this.baseCooldown = 12;
            this.trailColor = '#fca5a5';
            if (isPlayer) {
                this.color = '#ef4444';
            }
        } else if (type === 'sniper') {
            this.width = 36; this.height = 36;
            this.barrelLen = 32;
            this.turretR = 8;
            this.speed = 1.3;
            this.maxHealth = 55;
            this.health = 55;
            this.attackDamage = 40;
            this.baseCooldown = 55;
            this.color = '#34d399';
            this.aiTimer = 80;
            this.aiTargetAngle = Math.random() * Math.PI * 2;
        } else if (type === 'swarm') {
            this.width = 28; this.height = 28;
            this.barrelLen = 10;
            this.turretR = 6;
            this.speed = 6.5;
            this.maxHealth = 30;
            this.health = 30;
            this.attackDamage = 6;
            this.baseCooldown = 10;
            this.color = '#facc15';
            this.trailColor = '#fde68a';
        }
    }
}

function startGame(tankType) {
    player = new Tank(220, WORLD_HEIGHT - 240, tankType, true);
    enemies = [];
    allies = [];
    bullets = [];
    buildings = createBuildings();
    worldProps = createWorldProps();
    roadSegments = createRoads();
    money = 0;
    bankBalance = 0;
    spawnTimer = 0;
    gameOverMessage = '你的坦克已经被击毁。';
    refuelState.active = false;
    interactionTarget = null;
    camera = { x: 0, y: 0 };
    syncPanels();
    setInfoMessage('战场已部署完成。去粉牌商店、黄牌加油站或蓝牌银行看看。', 220);

    for (let i = 0; i < 2; i += 1) {
        spawnEnemy();
    }

    startScreen.classList.add('hidden');
    shopScreen.classList.add('hidden');
    bankScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    uiLayer.classList.remove('hidden');
    gameState = 'playing';
    updateUI();
}

function createBuildings() {
    return [
        createBuilding('shop-west', 240, 280, 144, 110, 'shop'),
        createBuilding('gas-central', 1010, 760, 150, 120, 'gas'),
        createBuilding('bank-east', 1640, 360, 152, 116, 'bank'),
        createBuilding('shop-south', 1500, 1120, 150, 112, 'shop'),
        createBuilding('gas-north', 530, 118, 156, 120, 'gas')
    ];
}

function createBuilding(id, x, y, width, height, type) {
    return {
        id,
        x,
        y,
        width,
        height,
        type,
        roofDepth: 22,
        interactX: x + width / 2,
        interactY: y + height + 40
    };
}

function createWorldProps() {
    const props = [];
    const elevatedBlocks = [
        [420, 420, 140, 90, 28, '#a78bfa'],
        [660, 1060, 180, 100, 34, '#818cf8'],
        [1120, 300, 120, 120, 30, '#f472b6'],
        [1260, 920, 210, 110, 30, '#38bdf8'],
        [1780, 680, 140, 100, 26, '#fbbf24']
    ];

    elevatedBlocks.forEach(([x, y, width, height, depth, color], index) => {
        props.push({
            id: `block-${index}`,
            kind: 'block',
            x,
            y,
            width,
            height,
            depth,
            color,
            solid: true
        });
    });

    const trees = [
        [340, 1040], [860, 470], [920, 1290], [1420, 520], [1870, 220],
        [1860, 1290], [680, 1450], [1220, 1310], [1540, 860], [260, 620]
    ];

    trees.forEach(([x, y], index) => {
        props.push({
            id: `tree-${index}`,
            kind: 'tree',
            x,
            y,
            radius: 28,
            solid: true
        });
    });

    // Ground decor: flowers / pebbles / grass tufts (non-solid, avoid roads)
    const roads = createRoads();
    const decorKinds = ['flower', 'flower', 'pebble', 'grass', 'grass', 'grass'];
    const flowerColors = ['#f472b6', '#facc15', '#a78bfa', '#fb923c', '#f8fafc'];
    let placed = 0;
    let attempts = 0;
    while (placed < 70 && attempts < 300) {
        attempts += 1;
        const dx = 40 + Math.random() * (WORLD_WIDTH - 80);
        const dy = 40 + Math.random() * (WORLD_HEIGHT - 80);
        const onRoad = roads.some((r) => dx > r.x - 12 && dx < r.x + r.width + 12 && dy > r.y - 12 && dy < r.y + r.height + 12);
        const onBlock = elevatedBlocks.some(([bx, by, bw, bh]) => dx > bx - 16 && dx < bx + bw + 16 && dy > by - 16 && dy < by + bh + 40);
        if (onRoad || onBlock) {
            continue;
        }
        const kind = decorKinds[Math.floor(Math.random() * decorKinds.length)];
        props.push({
            id: `decor-${placed}`,
            kind: 'decor',
            decor: kind,
            x: dx,
            y: dy,
            color: kind === 'flower' ? flowerColors[Math.floor(Math.random() * flowerColors.length)] : null,
            size: 3 + Math.random() * 3,
            solid: false
        });
        placed += 1;
    }

    return props;
}

function createRoads() {
    return [
        { x: 0, y: 720, width: WORLD_WIDTH, height: 94 },
        { x: 970, y: 0, width: 98, height: WORLD_HEIGHT },
        { x: 260, y: 290, width: 930, height: 82 },
        { x: 1110, y: 1090, width: 820, height: 78 }
    ];
}

function spawnEnemy() {
    const types = ['balanced', 'heavy', 'speed', 'sniper', 'swarm', 'swarm'];
    const type = types[Math.floor(Math.random() * types.length)];
    const isSwarm = type === 'swarm';
    const count = isSwarm ? 2 : 1;

    for (let i = 0; i < count; i++) {
        let x = 0;
        let y = 0;
        let attempts = 0;
        const size = type === 'swarm' ? 28 : type === 'sniper' ? 36 : type === 'heavy' ? 52 : type === 'speed' ? 36 : 44;

        do {
            x = 120 + Math.random() * (WORLD_WIDTH - 240);
            y = 120 + Math.random() * (WORLD_HEIGHT - 240);
            attempts += 1;
        } while (
            attempts < 40 &&
            (distance(x, y, player.x, player.y) < 360 || collidesWithSolids({ x, y, width: size, height: size }))
        );

        const enemy = new Tank(x + (isSwarm ? i * 40 : 0), y, type, false);
        // Enemy scaling (sniper/swarm are glass-cannon by design, scale less)
        if (type === 'sniper') {
            enemy.maxHealth = Math.round(enemy.maxHealth * 0.85);
            enemy.health = enemy.maxHealth;
            enemy.attackDamage = Math.round(enemy.attackDamage * 0.85);
            enemy.aiTimer = 90 + Math.random() * 60;
        } else if (type === 'swarm') {
            enemy.maxHealth = Math.round(enemy.maxHealth * 0.9);
            enemy.health = enemy.maxHealth;
            enemy.attackDamage = Math.round(enemy.attackDamage * 0.9);
            enemy.aiTimer = 20 + Math.random() * 30;
        } else {
            enemy.maxHealth = Math.round(enemy.maxHealth * 0.72);
            enemy.health = enemy.maxHealth;
            enemy.attackDamage = Math.round(enemy.attackDamage * 0.72);
            enemy.baseCooldown += 10;
            enemy.speed *= 0.86;
        }
        enemy.aiTimer = enemy.aiTimer || (50 + Math.random() * 90);
        enemy.aiTargetAngle = Math.random() * Math.PI * 2;
        enemies.push(enemy);
    }
}

function recruitEnemyAsAlly(enemy) {
    if (enemy.converted) {
        return;
    }

    // Cap: max 3 allies
    if (allies.length >= 3) {
        enemy.converted = true;
        return;
    }

    enemy.converted = true;
    const ally = new Tank(enemy.x, enemy.y, enemy.type, false);
    ally.team = 'friendly';
    ally.isCompanion = true;
    ally.color = enemy.type === 'heavy' ? '#60a5fa' : enemy.type === 'speed' ? '#22c55e' : '#38bdf8';
    ally.maxHealth = Math.max(48, Math.round(enemy.maxHealth * 0.82));
    ally.health = ally.maxHealth;
    ally.attackDamage = Math.max(8, Math.round(enemy.attackDamage * 0.88));
    ally.baseCooldown = enemy.baseCooldown + 4;
    ally.speed = enemy.speed * 0.96;
    ally.followDistance = 86 + Math.random() * 64;
    ally.aiTimer = 15;
    ally.aiTargetAngle = enemy.aiTargetAngle;
    allies.push(ally);
}

function getTankCenter(tank) {
    return {
        x: tank.x + tank.width / 2,
        y: tank.y + tank.height / 2
    };
}

function getNearestEnemyTarget(sourceX, sourceY, maxDistance = Infinity) {
    let target = null;
    let minDistance = maxDistance;

    enemies.forEach((enemy) => {
        if (enemy.converted || enemy.health <= 0) {
            return;
        }
        const enemyCenter = getTankCenter(enemy);
        const dist = distance(sourceX, sourceY, enemyCenter.x, enemyCenter.y);
        if (dist < minDistance) {
            minDistance = dist;
            target = enemy;
        }
    });

    return target;
}

function getNearestFriendlyTarget(sourceX, sourceY) {
    const friendlies = [player, ...allies].filter(Boolean);
    let target = null;
    let minDistance = Infinity;

    friendlies.forEach((friendly) => {
        if (friendly.health <= 0) {
            return;
        }
        const center = getTankCenter(friendly);
        const dist = distance(sourceX, sourceY, center.x, center.y);
        if (dist < minDistance) {
            minDistance = dist;
            target = friendly;
        }
    });

    return target;
}

function getPlayerAimAngle() {
    if (!player) {
        return -Math.PI / 2;
    }

    const center = getTankCenter(player);
    const target = getNearestEnemyTarget(center.x, center.y, 880);
    if (target) {
        const targetCenter = getTankCenter(target);
        player.angle = Math.atan2(targetCenter.y - center.y, targetCenter.x - center.x);
    }
    return player.angle;
}

function setInfoMessage(message, duration = 120) {
    infoMessage = message;
    infoMessageTimer = duration;
}

function updateInfoMessage() {
    if (infoMessageTimer > 0) {
        infoMessageTimer -= 1;
    } else if (!interactionTarget && !refuelState.active) {
        infoMessage = '⬆️⬇️⬅️➡️ 方向键移动 · 🚀Space 攻击 · 🛒靠近建筑点击互动';
    }
    statusText.textContent = infoMessage;
}

function closePanels() {
    shopScreen.classList.add('hidden');
    bankScreen.classList.add('hidden');
    if (gameState !== 'gameover') {
        gameState = 'playing';
        setInfoMessage('已回到战场。', 90);
    }
}

function openShop() {
    syncPanels();
    shopScreen.classList.remove('hidden');
    bankScreen.classList.add('hidden');
    gameState = 'shop';
    setInfoMessage('商店已打开，可以补给和升级。', 120);
}

function openBank() {
    syncPanels();
    bankScreen.classList.remove('hidden');
    shopScreen.classList.add('hidden');
    gameState = 'bank';
    setInfoMessage('银行已打开，可以存取金币。', 120);
}

function syncPanels() {
    shopMoney.textContent = money;
    bankMoney.textContent = money;
    bankBalanceText.textContent = bankBalance;
}

function buyItem(item) {
    if (!player) {
        return;
    }

    if (item === 'heal') {
        if (money < 30) {
            setInfoMessage('金币不足，无法修理。', 120);
            showToast('💰 金币不足！', 'warn');
            return;
        }
        money -= 30;
        player.health = player.maxHealth;
        setInfoMessage('坦克已修理完毕。', 120);
        showToast('❤️ 坦克修复完毕！', 'success');
    } else if (item === 'attack') {
        if (money < 45) {
            setInfoMessage('金币不足，无法升级火力。', 120);
            showToast('💰 金币不足！', 'warn');
            return;
        }
        money -= 45;
        player.attackDamage += 5;
        setInfoMessage('主炮伤害提升。', 120);
        showToast('⚔️ 攻击力 UP！', 'special');
    } else if (item === 'speed') {
        if (money < 40) {
            setInfoMessage('金币不足，无法升级机动。', 120);
            showToast('💰 金币不足！', 'warn');
            return;
        }
        money -= 40;
        player.speed += 0.28;
        setInfoMessage('移动速度提升。', 120);
        showToast('💨 速度 UP！', 'special');
    } else if (item === 'fuel') {
        if (money < 35) {
            setInfoMessage('金币不足，无法扩充油箱。', 120);
            showToast('💰 金币不足！', 'warn');
            return;
        }
        money -= 35;
        player.maxFuel += 15;
        player.fuel = Math.min(player.maxFuel, player.fuel + 18);
        setInfoMessage('油箱容量提升。', 120);
        showToast('⛽ 油箱扩容！', 'success');
    }

    syncPanels();
    updateUI();
}

function useAbility(code) {
    if (!player || player.abilityCooldowns[code] > 0) {
        return;
    }

    if (code === 'KeyQ') {
        player.abilityCooldowns.KeyQ = ABILITIES.KeyQ.cooldown;
        player.queuedBursts = [0, 6, 12, 18];
        setInfoMessage('Q 连发启动。', 70);
        showToast('🔫 连发！', 'info');
    } else if (code === 'KeyW') {
        player.abilityCooldowns.KeyW = ABILITIES.KeyW.cooldown;
        const spread = [-0.34, -0.17, 0, 0.17, 0.34];
        const aimAngle = getPlayerAimAngle();
        spread.forEach((offset) => {
            fireBullet(player, aimAngle + offset, 8.5, player.attackDamage * 0.9, 'friendly', { color: '#fde68a' });
        });
        setInfoMessage('W 散射发射。', 70);
        showToast('💥 散射！', 'info');
    } else if (code === 'KeyE') {
        player.abilityCooldowns.KeyE = ABILITIES.KeyE.cooldown;
        player.shieldTimer = 240;
        setInfoMessage('E 护盾展开。', 90);
        showToast('🛡️ 护盾！', 'info');
    } else if (code === 'KeyR') {
        player.abilityCooldowns.KeyR = ABILITIES.KeyR.cooldown;
        fireBullet(player, getPlayerAimAngle(), 11, player.attackDamage * 3.1, 'friendly', {
            color: '#67e8f9',
            radius: 6,
            pierce: true
        });
        setInfoMessage('R 穿甲炮发射。', 90);
        showToast('⚡ 穿甲炮！', 'special');
    }
}

function fireBullet(owner, angle, speed, damage, team, options = {}) {
    const originX = owner.x + owner.width / 2;
    const originY = owner.y + owner.height / 2;
    bullets.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: options.radius || 4,
        damage,
        team,
        color: options.color || (team === 'friendly' ? '#fbbf24' : '#f87171'),
        pierce: Boolean(options.pierce),
        active: true
    });
}

function updatePlayer() {
    if (!player) {
        return;
    }

    if (player.shootCooldown > 0) {
        player.shootCooldown -= 1;
    }

    Object.keys(player.abilityCooldowns).forEach((code) => {
        if (player.abilityCooldowns[code] > 0) {
            player.abilityCooldowns[code] -= 1;
        }
    });

    if (player.shieldTimer > 0) {
        player.shieldTimer -= 1;
    }

    if (player.queuedBursts.length > 0) {
        player.queuedBursts = player.queuedBursts
            .map((value) => value - 1)
            .filter((value) => {
                if (value <= 0) {
                    fireBullet(player, getPlayerAimAngle(), 8.6, player.attackDamage, 'friendly');
                    return false;
                }
                return true;
            });
    }

    if (refuelState.active) {
        runRefuel();
        return;
    }

    let moveX = 0;
    let moveY = 0;

    if (keys.ArrowUp) {
        moveY -= 1;
    }
    if (keys.ArrowDown) {
        moveY += 1;
    }
    if (keys.ArrowLeft) {
        moveX -= 1;
    }
    if (keys.ArrowRight) {
        moveX += 1;
    }

    const moving = moveX !== 0 || moveY !== 0;
    player.moving = moving;
    if (moving) {
        const length = Math.hypot(moveX, moveY) || 1;
        moveX = (moveX / length) * player.speed;
        moveY = (moveY / length) * player.speed;
        moveEntity(player, moveX, moveY);
        player.fuel = Math.max(0, player.fuel - 0.026);
    }

    getPlayerAimAngle();

    if (keys.Space && player.shootCooldown <= 0) {
        player.shootCooldown = player.baseCooldown;
        fireBullet(player, getPlayerAimAngle(), 8.2, player.attackDamage, 'friendly');
    }

    if (player.fuel <= 0) {
        player.fuel = 0;
        loseGame('燃料耗尽，坦克失去动力。');
    }
}

function updateEnemies() {
    enemies.forEach((enemy) => {
        if (enemy.shootCooldown > 0) {
            enemy.shootCooldown -= 1;
        }

        const enemyCenter = getTankCenter(enemy);
        const target = getNearestFriendlyTarget(enemyCenter.x, enemyCenter.y) || player;
        enemy.aiTimer -= 1;
        if (enemy.aiTimer <= 0) {
            const targetCenter = getTankCenter(target);
            const dx = targetCenter.x - enemyCenter.x;
            const dy = targetCenter.y - enemyCenter.y;
            enemy.aiTargetAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.8;
            enemy.aiTimer = 55 + Math.random() * 100;
        }

        const speed = enemy.speed * 0.56;
        const vx = Math.cos(enemy.aiTargetAngle) * speed;
        const vy = Math.sin(enemy.aiTargetAngle) * speed;
        const moved = moveEntity(enemy, vx, vy);
        enemy.moving = moved;
        if (!moved) {
            enemy.aiTargetAngle += Math.PI / 2.4;
            enemy.aiTimer = 18;
        } else {
            enemy.angle = enemy.aiTargetAngle;
        }

        const targetCenter = getTankCenter(target);
        const distanceToTarget = distance(enemyCenter.x, enemyCenter.y, targetCenter.x, targetCenter.y);
        const shootRange = enemy.type === 'sniper' ? 1000 : 430;
        if (distanceToTarget < shootRange && enemy.shootCooldown <= 0 && Math.random() < (enemy.type === 'sniper' ? 0.008 : 0.014)) {
            enemy.shootCooldown = enemy.baseCooldown + 14;
            const angle = Math.atan2(targetCenter.y - enemyCenter.y, targetCenter.x - enemyCenter.x);
            enemy.angle = angle;
            fireBullet(enemy, angle, enemy.type === 'sniper' ? 10 : 6.6, enemy.attackDamage * (enemy.type === 'sniper' ? 1.0 : 0.75), 'enemy', enemy.type === 'sniper' ? { color: '#6ee7b7', radius: 5 } : undefined);
        }
    });
}

function updateAllies() {
    allies.forEach((ally, index) => {
        if (ally.shootCooldown > 0) {
            ally.shootCooldown -= 1;
        }

        const allyCenter = getTankCenter(ally);
        const enemyTarget = getNearestEnemyTarget(allyCenter.x, allyCenter.y, 720);
        if (enemyTarget) {
            const targetCenter = getTankCenter(enemyTarget);
            const angleToEnemy = Math.atan2(targetCenter.y - allyCenter.y, targetCenter.x - allyCenter.x);
            ally.angle = angleToEnemy;

            const distanceToEnemy = distance(allyCenter.x, allyCenter.y, targetCenter.x, targetCenter.y);
            if (distanceToEnemy > 180) {
                ally.moving = moveEntity(ally, Math.cos(angleToEnemy) * ally.speed * 0.72, Math.sin(angleToEnemy) * ally.speed * 0.72);
            } else {
                ally.moving = false;
            }

            if (distanceToEnemy < 520 && ally.shootCooldown <= 0 && Math.random() < 0.05) {
                ally.shootCooldown = ally.baseCooldown + 10;
                fireBullet(ally, angleToEnemy, 7.8, ally.attackDamage, 'friendly', {
                    color: '#93c5fd'
                });
            }
            return;
        }

        const slotAngle = ((index % 4) / 4) * Math.PI * 2;
        const ring = 80 + Math.floor(index / 4) * 42;
        const desiredX = player.x + Math.cos(slotAngle) * (ally.followDistance + ring * 0.15);
        const desiredY = player.y + Math.sin(slotAngle) * (ally.followDistance + ring * 0.15);
        const angleToSlot = Math.atan2(desiredY - ally.y, desiredX - ally.x);
        const distToSlot = distance(ally.x, ally.y, desiredX, desiredY);

        if (distToSlot > 20) {
            ally.angle = angleToSlot;
            ally.moving = moveEntity(ally, Math.cos(angleToSlot) * ally.speed * 0.75, Math.sin(angleToSlot) * ally.speed * 0.75);
        } else {
            ally.moving = false;
        }
    });
}

function runRefuel() {
    const station = buildings.find((building) => building.id === refuelState.buildingId);
    if (!station) {
        cancelRefuel();
        return;
    }

    if (distance(player.x + player.width / 2, player.y + player.height / 2, station.interactX, station.interactY) > 110) {
        cancelRefuel('离开加油范围，已停止加油。');
        return;
    }

    refuelState.progress += 1;
    player.fuel = Math.min(player.maxFuel, player.fuel + 0.05);

    if (refuelState.progress >= refuelState.chargeTime) {
        refuelState.progress = 0;
        player.fuel = Math.min(player.maxFuel, player.fuel + refuelState.fuelPerCharge);
    }

    setInfoMessage('正在加油，按 Esc 可取消。', 2);

    if (player.fuel >= player.maxFuel) {
        refuelState.active = false;
        refuelState.progress = 0;
        refuelState.buildingId = null;
        setInfoMessage('加油完成，油量已补满。', 120);
        showToast('⛽ 油量已满！', 'success');
    }
}

function startRefuel(building) {
    refuelState.active = true;
    refuelState.buildingId = building.id;
    refuelState.progress = 0;
    setInfoMessage('已开始加油，请保持在站点附近。', 120);
}

function cancelRefuel(message = '') {
    refuelState.active = false;
    refuelState.progress = 0;
    refuelState.buildingId = null;
    if (message) {
        setInfoMessage(message, 120);
    }
}

function moveEntity(entity, dx, dy) {
    let moved = false;

    if (dx !== 0) {
        entity.x += dx;
        clampEntity(entity);
        if (collidesWithSolids(entity)) {
            entity.x -= dx;
        } else {
            moved = true;
        }
    }

    if (dy !== 0) {
        entity.y += dy;
        clampEntity(entity);
        if (collidesWithSolids(entity)) {
            entity.y -= dy;
        } else {
            moved = true;
        }
    }

    return moved;
}

function clampEntity(entity) {
    entity.x = Math.max(0, Math.min(WORLD_WIDTH - entity.width, entity.x));
    entity.y = Math.max(0, Math.min(WORLD_HEIGHT - entity.height, entity.y));
}

function collidesWithSolids(entity) {
    const rect = { x: entity.x, y: entity.y, width: entity.width, height: entity.height };
    return getSolidRects().some((solid) => intersects(rect, solid));
}

function getSolidRects() {
    const buildingRects = buildings.map((building) => ({
        x: building.x + 8,
        y: building.y + 24,
        width: building.width - 16,
        height: building.height - 18
    }));

    const propRects = worldProps
        .filter((prop) => prop.solid)
        .map((prop) => {
            if (prop.kind === 'block') {
                return { x: prop.x, y: prop.y, width: prop.width, height: prop.height };
            }
            return {
                x: prop.x - prop.radius + 6,
                y: prop.y - prop.radius + 6,
                width: prop.radius * 2 - 12,
                height: prop.radius * 2 - 12
            };
        });

    return [...buildingRects, ...propRects];
}

function updateBullets() {
    const solids = getSolidRects();

    bullets.forEach((bullet) => {
        if (!bullet.active) {
            return;
        }

        bullet.x += bullet.vx;
        bullet.y += bullet.vy;

        if (bullet.x < -10 || bullet.x > WORLD_WIDTH + 10 || bullet.y < -10 || bullet.y > WORLD_HEIGHT + 10) {
            bullet.active = false;
            return;
        }

        const bulletRect = {
            x: bullet.x - bullet.radius,
            y: bullet.y - bullet.radius,
            width: bullet.radius * 2,
            height: bullet.radius * 2
        };

        if (!bullet.pierce && solids.some((solid) => intersects(bulletRect, solid))) {
            bullet.active = false;
            return;
        }

        if (bullet.team === 'friendly') {
            enemies.forEach((enemy) => {
                if (!bullet.active || enemy.converted) {
                    return;
                }
                if (pointInRect(bullet.x, bullet.y, enemy)) {
                    enemy.health -= bullet.damage;
                    enemy.flashTimer = 6;
                    spawnParticles(bullet.x, bullet.y, 3, '#f87171', 2);
                    if (!bullet.pierce) {
                        bullet.active = false;
                    }
                    if (enemy.health <= 0 && !enemy.converted) {
                        // Death particles + float text
                        const ec = getTankCenter(enemy);
                        const isSpecial = enemy.type === 'sniper' || enemy.type === 'swarm';
                        const bonus = enemy.type === 'sniper' ? 25 : enemy.type === 'swarm' ? 8 : 18;

                        spawnParticles(ec.x, ec.y, enemy.type === 'sniper' ? 20 : enemy.type === 'swarm' ? 6 : 15, '#facc15', 4);
                        spawnParticles(ec.x, ec.y, enemy.type === 'sniper' ? 12 : enemy.type === 'swarm' ? 4 : 8, '#f87171', 3);
                        spawnFloatText(ec.x, ec.y - 10, `+${bonus} 💰`, '#facc15');
                        triggerShake(enemy.type === 'sniper' ? 3 : 1);
                        money += bonus;

                        if (isSpecial) {
                            enemy.converted = true;
                            setInfoMessage(`${enemy.type === 'sniper' ? '🎯 狙击手' : '🐝 蜂群'}被击毁。`, 100);
                            showToast(`${enemy.type === 'sniper' ? '🎯 击毁狙击手' : '🐝 击毁蜂群'} +${bonus}💰`, 'gold');
                        } else {
                            const canRecruit = allies.length < 3;
                            recruitEnemyAsAlly(enemy);
                            if (canRecruit) {
                                setInfoMessage('一辆敌方坦克被收编为友军。', 100);
                                showToast('🚀 收编敌军 +18💰', 'gold');
                            } else {
                                setInfoMessage('队友已满（最多3个），敌军被击毁。', 100);
                                showToast('💥 击毁敌军 +18💰', 'gold');
                            }
                        }
                    }
                }
            });
        } else {
            if (pointInRect(bullet.x, bullet.y, player)) {
                if (player.shieldTimer <= 0) {
                    player.health -= bullet.damage;
                    player.flashTimer = 6;
                    spawnParticles(bullet.x, bullet.y, 4, '#f87171', 2);
                    triggerShake(5);
                } else {
                    // Shield hit feedback
                    const pc = getTankCenter(player);
                    spawnParticles(pc.x, pc.y, 6, '#67e8f9', 3);
                }
                if (!bullet.pierce) {
                    bullet.active = false;
                }
                if (player.health <= 0) {
                    const pc = getTankCenter(player);
                    spawnParticles(pc.x, pc.y, 25, '#f87171', 5);
                    spawnParticles(pc.x, pc.y, 15, '#fbbf24', 4);
                    triggerShake(10);
                    loseGame('你的坦克被敌军火力击毁。');
                }
            }

            allies.forEach((ally) => {
                if (!bullet.active) {
                    return;
                }
                if (pointInRect(bullet.x, bullet.y, ally)) {
                    ally.health -= bullet.damage;
                    ally.flashTimer = 6;
                    spawnParticles(bullet.x, bullet.y, 3, '#f87171', 2);
                    if (!bullet.pierce) {
                        bullet.active = false;
                    }
                    if (ally.health <= 0) {
                        const ac = getTankCenter(ally);
                        spawnParticles(ac.x, ac.y, 12, '#93c5fd', 3);
                        triggerShake(2);
                    }
                }
            });
        }
    });

    enemies = enemies.filter((enemy) => enemy.health > 0 && !enemy.converted);
    allies = allies.filter((ally) => ally.health > 0);
    bullets = bullets.filter((bullet) => bullet.active);

    spawnTimer += 1;
    if (spawnTimer >= 280) {
        spawnTimer = 0;
        const maxEnemies = allies.length >= 4 ? 5 : 4;
        if (enemies.length < maxEnemies) {
            spawnEnemy();
        }
    }
}

function updateInteractionTarget() {
    interactionTarget = null;

    if (!player || gameState !== 'playing') {
        return;
    }

    if (refuelState.active) {
        return;
    }

    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;

    buildings.forEach((building) => {
        const dist = distance(playerCenterX, playerCenterY, building.interactX, building.interactY);
        if (dist <= 112 && (!interactionTarget || dist < interactionTarget.distance)) {
            interactionTarget = {
                ...building,
                distance: dist
            };
        }
    });

    if (interactionTarget) {
        infoMessage = BUILDING_TYPES[interactionTarget.type].prompt;
    } else if (!refuelState.active && infoMessageTimer <= 0) {
        infoMessage = '⬆️⬇️⬅️➡️ 方向键移动 · 🚀Space 攻击会优先瞄准最近敌人';
    }
}

function updateCamera() {
    if (!player) {
        return;
    }

    camera.x = clamp(player.x + player.width / 2 - VIEW_WIDTH / 2, 0, WORLD_WIDTH - VIEW_WIDTH);
    camera.y = clamp(player.y + player.height / 2 - VIEW_HEIGHT / 2, 0, WORLD_HEIGHT - VIEW_HEIGHT);
}

function updateUI() {
    if (!player) {
        return;
    }

    const healthRatio = clamp(player.health / player.maxHealth, 0, 1);
    const fuelRatio = clamp(player.fuel / player.maxFuel, 0, 1);

    healthFill.style.width = `${healthRatio * 100}%`;
    fuelFill.style.width = `${fuelRatio * 100}%`;
    healthText.textContent = `${Math.ceil(Math.max(0, player.health))} / ${player.maxHealth}`;
    fuelText.textContent = `${Math.ceil(Math.max(0, player.fuel))} / ${player.maxFuel}`;
    moneyText.textContent = String(money);
    bankText.textContent = String(bankBalance);

    Object.keys(ABILITIES).forEach((code) => {
        const chip = document.querySelector(`.ability-chip[data-ability="${code}"]`);
        const cooldownNode = document.getElementById(`cooldown-${code}`);
        const cooldown = player.abilityCooldowns[code];

        if (cooldown > 0) {
            chip.classList.add('cooling');
            chip.classList.remove('ready');
            cooldownNode.textContent = `${Math.ceil(cooldown / 60)}s`;
        } else {
            chip.classList.remove('cooling');
            chip.classList.add('ready');
            cooldownNode.textContent = '就绪';
        }
    });
}

function loseGame(message) {
    gameOverMessage = message;
    gameOverReason.textContent = message;
    gameState = 'gameover';
    refuelState.active = false;
    shopScreen.classList.add('hidden');
    bankScreen.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
}

function draw() {
    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    drawTerrain();
    drawRoads();
    drawWorldProps();
    drawBuildings();
    drawBullets();
    drawTanks();
    drawParticles();
    drawFloatTexts();
    drawInteractionPoint();
    drawRefuelProgress();
}

function drawParticles() {
    ctx.save();
    particles.forEach((p) => {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x - camera.x, p.y - camera.y, p.radius * alpha, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function drawFloatTexts() {
    ctx.save();
    floatTexts.forEach((ft) => {
        const progress = 1 - ft.life / ft.maxLife;
        const alpha = ft.life < 10 ? ft.life / 10 : 1;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 3;
        ctx.fillText(ft.text, ft.x - camera.x, ft.y - camera.y - progress * 30);
    });
    ctx.restore();
}

function drawTerrain() {
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
    sky.addColorStop(0, '#7c9bc0');
    sky.addColorStop(0.5, '#a8c8e8');
    sky.addColorStop(1, '#c9ddf5');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    const ground = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    ground.addColorStop(0, '#8cb369');
    ground.addColorStop(0.55, '#6d9a4a');
    ground.addColorStop(1, '#4a7c32');
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD_WIDTH; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD_HEIGHT);
        ctx.stroke();
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += 80) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_WIDTH, y);
        ctx.stroke();
    }

    ctx.restore();
}

function drawRoads() {
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    roadSegments.forEach((road) => {
        // Curb (darker border drawn slightly outside)
        ctx.fillStyle = '#45455a';
        ctx.fillRect(road.x - 5, road.y - 5, road.width + 10, road.height + 10);

        // Road surface
        ctx.fillStyle = '#5a5a6e';
        ctx.fillRect(road.x, road.y, road.width, road.height);

        // Top highlight strip
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(road.x, road.y, road.width, 8);

        // Dashed center lane line
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 4;
        ctx.setLineDash([18, 16]);

        if (road.width > road.height) {
            ctx.beginPath();
            ctx.moveTo(road.x + 30, road.y + road.height / 2);
            ctx.lineTo(road.x + road.width - 30, road.y + road.height / 2);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(road.x + road.width / 2, road.y + 30);
            ctx.lineTo(road.x + road.width / 2, road.y + road.height - 30);
            ctx.stroke();
        }

        ctx.setLineDash([]);
    });

    ctx.restore();
}

function drawWorldProps() {
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    worldProps.forEach((prop) => {
        if (prop.kind === 'block') {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
            ctx.fillRect(prop.x + 14, prop.y + prop.depth, prop.width, prop.height);

            ctx.fillStyle = shadeColor(prop.color, -18);
            ctx.fillRect(prop.x + prop.width - 12, prop.y + 12, 12, prop.height + prop.depth);

            ctx.fillStyle = shadeColor(prop.color, -10);
            ctx.fillRect(prop.x, prop.y + prop.height, prop.width, prop.depth);

            ctx.fillStyle = prop.color;
            ctx.fillRect(prop.x, prop.y, prop.width, prop.height);
        } else if (prop.kind === 'tree') {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
            ctx.beginPath();
            ctx.ellipse(prop.x + 12, prop.y + 22, prop.radius, prop.radius * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#5b3a29';
            ctx.fillRect(prop.x - 6, prop.y + 18, 12, 30);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(prop.x - 6, prop.y + 18, 3, 30);

            // Canopy: dark base + bright top layer + outline
            ctx.fillStyle = '#166534';
            ctx.beginPath();
            ctx.arc(prop.x, prop.y + 4, prop.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.arc(prop.x, prop.y - 2, prop.radius * 0.88, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.14)';
            ctx.beginPath();
            ctx.arc(prop.x - 8, prop.y - 10, prop.radius * 0.42, 0, Math.PI * 2);
            ctx.fill();
        } else if (prop.kind === 'decor') {
            if (prop.decor === 'flower') {
                // Petals + yellow center
                ctx.fillStyle = prop.color;
                for (let i = 0; i < 5; i++) {
                    const a = (i / 5) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(prop.x + Math.cos(a) * prop.size, prop.y + Math.sin(a) * prop.size, prop.size * 0.8, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = '#fde047';
                ctx.beginPath();
                ctx.arc(prop.x, prop.y, prop.size * 0.7, 0, Math.PI * 2);
                ctx.fill();
            } else if (prop.decor === 'pebble') {
                ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
                ctx.beginPath();
                ctx.ellipse(prop.x, prop.y, prop.size + 2, prop.size, 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.beginPath();
                ctx.ellipse(prop.x - 1.5, prop.y - 1.5, prop.size * 0.4, prop.size * 0.3, 0.4, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Grass tuft: 3 blades
                ctx.strokeStyle = 'rgba(74, 124, 50, 0.85)';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(prop.x - 3, prop.y);
                ctx.quadraticCurveTo(prop.x - 5, prop.y - 6, prop.x - 4, prop.y - 9);
                ctx.moveTo(prop.x, prop.y);
                ctx.quadraticCurveTo(prop.x, prop.y - 7, prop.x + 1, prop.y - 11);
                ctx.moveTo(prop.x + 3, prop.y);
                ctx.quadraticCurveTo(prop.x + 5, prop.y - 6, prop.x + 6, prop.y - 8);
                ctx.stroke();
            }
        }
    });

    ctx.restore();
}

function drawBuildings() {
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    buildings.forEach((building) => {
        const config = BUILDING_TYPES[building.type];
        const roofY = building.y - building.roofDepth;
        const cx = building.x + building.width / 2;
        const emoji = building.type === 'shop' ? '🛒' : building.type === 'gas' ? '⛽' : '🏦';

        // Ground shadow
        ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
        ctx.fillRect(building.x + 16, building.y + building.height + 8, building.width, 18);

        // Right side face (pseudo-3D)
        ctx.fillStyle = shadeColor(config.wallColor, -18);
        ctx.fillRect(building.x + building.width - 14, roofY + 10, 14, building.height + 18);

        // Wall front (rounded bottom corners)
        ctx.fillStyle = config.wallColor;
        roundRect(ctx, building.x, building.y, building.width, building.height, 6);
        ctx.fill();

        // Wall top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(building.x, building.y, building.width, 6);

        // Windows (two, with light panes)
        const winW = 22;
        const winY = building.y + 18;
        [building.x + 16, building.x + building.width - 16 - winW].forEach((wx) => {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
            roundRect(ctx, wx, winY, winW, 20, 3);
            ctx.fill();
            ctx.fillStyle = '#fef9c3';
            roundRect(ctx, wx + 3, winY + 3, winW - 6, 14, 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillRect(wx + 5, winY + 5, 4, 10);
        });

        // Door (arched, centered at bottom)
        const doorW = 40;
        const doorH = 36;
        const doorX = cx - doorW / 2;
        const doorY = building.y + building.height - doorH;
        ctx.fillStyle = '#f8fafc';
        roundRect(ctx, doorX - 3, doorY - 3, doorW + 6, doorH + 3, 5);
        ctx.fill();
        ctx.fillStyle = shadeColor(config.wallColor, -35);
        roundRect(ctx, doorX, doorY, doorW, doorH, 4);
        ctx.fill();
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(doorX + doorW - 8, doorY + doorH / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Roof (overhang + trim)
        ctx.fillStyle = config.roofColor;
        roundRect(ctx, building.x - 10, roofY, building.width + 20, 30, 6);
        ctx.fill();
        ctx.fillStyle = shadeColor(config.roofColor, -12);
        roundRect(ctx, building.x - 4, roofY + 30, building.width + 8, 10, 3);
        ctx.fill();

        // Sign board with emoji + label
        ctx.fillStyle = config.signColor;
        roundRect(ctx, cx - 34, roofY - 24, 68, 22, 6);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        roundRect(ctx, cx - 34, roofY - 24, 68, 22, 6);
        ctx.stroke();

        ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1a1a2e';
        ctx.fillText(`${emoji} ${config.label}`, cx, roofY - 8);
    });

    ctx.restore();
}

function drawBullets() {
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    bullets.forEach((bullet) => {
        // Glow effect
        ctx.shadowBlur = 8;
        ctx.shadowColor = bullet.color;
        ctx.fillStyle = bullet.color;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
        // Reset shadow
        ctx.shadowBlur = 0;
    });
    ctx.restore();
}

// === Pseudo-3D cartoon tank model (per DESIGN_PROMPT.md section 4) ===
function drawTankModel(tank) {
    const w = tank.width;
    const h = tank.height;
    const flash = tank.flashTimer > 0 && tank.flashTimer % 4 < 2;
    const darkColor = flash ? '#e2e8f0' : shadeColor(tank.color, -28);
    const treadColor = tank.team === 'enemy' ? '#111827' : '#1a1a2e';

    ctx.save();
    ctx.translate(tank.x + w / 2, tank.y + h / 2);
    ctx.rotate(tank.angle + Math.PI / 2);

    // Soft ground shadow (ellipse)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.beginPath();
    ctx.ellipse(3, 4, w / 2 + 4, h / 2 + 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Treads (rounded + wheel dots)
    const treadW = tank.type === 'heavy' ? 9 : 7;
    const treadH = h - 4;
    const treadY = -h / 2 + 2;
    ctx.fillStyle = treadColor;
    roundRect(ctx, -w / 2 - treadW + 2, treadY, treadW, treadH, 3);
    ctx.fill();
    roundRect(ctx, w / 2 - 2, treadY, treadW, treadH, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 3; i++) {
        const wy = treadY + treadH * (i + 0.5) / 3;
        ctx.beginPath();
        ctx.arc(-w / 2 - treadW / 2 + 2, wy, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w / 2 + treadW / 2 - 2, wy, 1.8, 0, Math.PI * 2);
        ctx.fill();
    }

    // Speed type: rear exhaust pipes
    if (tank.type === 'speed') {
        ctx.fillStyle = '#64748b';
        ctx.fillRect(-w / 2 + 4, h / 2 - 4, 5, 7);
        ctx.fillRect(w / 2 - 9, h / 2 - 4, 5, 7);
    }

    // Body: rounded rect with vertical gradient (light top → dark bottom)
    const bodyGrad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    bodyGrad.addColorStop(0, flash ? '#ffffff' : shadeColor(tank.color, 24));
    bodyGrad.addColorStop(0.55, flash ? '#ffffff' : tank.color);
    bodyGrad.addColorStop(1, darkColor);
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, -w / 2, -h / 2, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, -w / 2, -h / 2, w, h, 8);
    ctx.stroke();

    // Heavy type: armor plates + rivets
    if (tank.type === 'heavy') {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 4, -h / 6);
        ctx.lineTo(w / 2 - 4, -h / 6);
        ctx.moveTo(-w / 2 + 4, h / 6);
        ctx.lineTo(w / 2 - 4, h / 6);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        [[-w / 2 + 6, -h / 2 + 6], [w / 2 - 6, -h / 2 + 6], [-w / 2 + 6, h / 2 - 6], [w / 2 - 6, h / 2 - 6]].forEach((p) => {
            ctx.beginPath();
            ctx.arc(p[0], p[1], 1.6, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // Swarm type: little golden wings
    if (tank.type === 'swarm') {
        ctx.fillStyle = 'rgba(253, 224, 71, 0.85)';
        ctx.beginPath();
        ctx.ellipse(-w / 2 - 3, -2, 5, 9, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(w / 2 + 3, -2, 5, 9, 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Barrel (drawn before turret so turret covers its base)
    const barrelW = tank.type === 'sniper' ? 5 : tank.type === 'heavy' ? 10 : 8;
    ctx.fillStyle = tank.team === 'enemy' ? '#9ca3af' : '#cbd5e1';
    ctx.fillRect(-barrelW / 2, -h / 2 - tank.barrelLen + 6, barrelW, tank.barrelLen);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-barrelW / 2, -h / 2 - tank.barrelLen + 6, 2, tank.barrelLen);
    if (tank.type === 'sniper') {
        ctx.fillStyle = '#065f46';
        ctx.beginPath();
        ctx.arc(0, -h / 2 - tank.barrelLen + 7, 4, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = darkColor;
        ctx.fillRect(-barrelW / 2 - 1, -h / 2 - tank.barrelLen + 4, barrelW + 2, 4);
    }

    // Turret: radial gradient + hatch
    const turGrad = ctx.createRadialGradient(-tank.turretR / 3, -tank.turretR / 3, 1, 0, 0, tank.turretR);
    turGrad.addColorStop(0, flash ? '#ffffff' : shadeColor(tank.color, 30));
    turGrad.addColorStop(1, darkColor);
    ctx.fillStyle = turGrad;
    ctx.beginPath();
    ctx.arc(0, 0, tank.turretR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(tank.turretR * 0.35, tank.turretR * 0.35, Math.max(2, tank.turretR * 0.32), 0, Math.PI * 2);
    ctx.fill();

    // Shield effect (player only)
    if (tank.isPlayer && tank.shieldTimer > 0) {
        const shieldR = tank.width / 2 + 12;
        const shieldAlpha = tank.shieldTimer < 40 ? 0.3 + (tank.shieldTimer / 40) * 0.6 : 0.9;
        ctx.strokeStyle = `rgba(103, 232, 249, ${shieldAlpha})`;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(103, 232, 249, 0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, shieldR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    ctx.restore();
}

function drawTanks() {
    const sorted = [...enemies, ...allies, player].filter(Boolean).sort((a, b) => a.y - b.y);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Update screen shake
    if (screenShake > 0) {
        screenShakeX = (Math.random() - 0.5) * screenShake * 2;
        screenShakeY = (Math.random() - 0.5) * screenShake * 2;
        screenShake *= 0.85;
        if (screenShake < 0.3) { screenShake = 0; screenShakeX = 0; screenShakeY = 0; }
        ctx.translate(screenShakeX, screenShakeY);
    }

    sorted.forEach((tank) => {
        // Damage flash
        if (tank.flashTimer > 0) { tank.flashTimer -= 1; }

        drawTankModel(tank);

        // Exhaust trail for speed tanks
        if (tank.trailColor && tank.moving) {
            const cx = tank.x + tank.width / 2;
            const cy = tank.y + tank.height;
            ctx.fillStyle = tank.trailColor;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(cx - 4, cy, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx + 4, cy, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // === Improved HP bar (40x6, rounded, gradient) ===
        const hpRatio = clamp(tank.health / tank.maxHealth, 0, 1);
        const barW = 40;
        const barH = 6;
        const barX = tank.x + (tank.width - barW) / 2;
        const barY = tank.y - 14;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, barX, barY, barW, barH, 3);
        ctx.fill();

        // Fill with gradient (green → yellow → red)
        if (hpRatio > 0) {
            const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW * hpRatio, 0);
            if (hpRatio > 0.5) {
                fillGrad.addColorStop(0, '#22c55e');
                fillGrad.addColorStop(1, '#eab308');
            } else {
                fillGrad.addColorStop(0, '#eab308');
                fillGrad.addColorStop(1, '#ef4444');
            }
            ctx.fillStyle = fillGrad;
            roundRect(ctx, barX, barY, barW * hpRatio, barH, 3);
            ctx.fill();
        }

        // Tank type label (only for allies/enemies)
        if (!tank.isPlayer && tank.health > 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.font = '10px "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(tank.team === 'enemy' ? '敌军' : '友军', tank.x + tank.width / 2, barY - 4);
        }
    });

    ctx.restore();
}

// Helper: rounded rectangle path
function roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + w - r, y);
    context.arcTo(x + w, y, x + w, y + r, r);
    context.lineTo(x + w, y + h - r);
    context.arcTo(x + w, y + h, x + w - r, y + h, r);
    context.lineTo(x + r, y + h);
    context.arcTo(x, y + h, x, y + h - r, r);
    context.lineTo(x, y + r);
    context.arcTo(x, y, x + r, y, r);
    context.closePath();
}

function drawInteractionPoint() {
    if (!interactionTarget || gameState !== 'playing') {
        return;
    }

    const sx = interactionTarget.interactX - camera.x;
    const sy = interactionTarget.interactY - camera.y;
    const pulse = Math.sin(Date.now() / 160) * 4;

    ctx.save();
    ctx.translate(sx, sy + pulse);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = BUILDING_TYPES[interactionTarget.type].signColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    const emojis = { shop: '🛒', gas: '⛽', bank: '🏦' };
    ctx.fillText(emojis[interactionTarget.type] || '点', 0, 8);
    ctx.restore();
}

function drawRefuelProgress() {
    if (!refuelState.active) {
        return;
    }

    const station = buildings.find((building) => building.id === refuelState.buildingId);
    if (!station) {
        return;
    }

    const progress = refuelState.progress / refuelState.chargeTime;
    const x = station.x + station.width / 2 - camera.x - 70;
    const y = station.y - camera.y - 42;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fillRect(x, y, 140, 16);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x + 2, y + 2, 136 * progress, 12);
    ctx.strokeStyle = '#f8fafc';
    ctx.strokeRect(x, y, 140, 16);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px "Microsoft YaHei"';
    ctx.fillText('加油中', x + 70, y - 8);
}

function shadeColor(hex, delta) {
    const value = hex.replace('#', '');
    const num = parseInt(value, 16);
    const r = clamp(((num >> 16) & 255) + delta, 0, 255);
    const g = clamp(((num >> 8) & 255) + delta, 0, 255);
    const b = clamp((num & 255) + delta, 0, 255);
    return `rgb(${r}, ${g}, ${b})`;
}

function intersects(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function distance(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function gameLoop() {
    if (gameState === 'playing') {
        updatePlayer();
        updateEnemies();
        updateAllies();
        updateBullets();
        updateParticles();
        updateFloatTexts();
        updateInteractionTarget();
        updateCamera();
        updateUI();
    } else if (player) {
        updateCamera();
        updateUI();
    }

    updateInfoMessage();
    draw();
    requestAnimationFrame(gameLoop);
}

function updateParticles() {
    particles = particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= 1;
        return p.life > 0;
    });
}

function updateFloatTexts() {
    floatTexts = floatTexts.filter((ft) => {
        ft.life -= 1;
        return ft.life > 0;
    });
}

requestAnimationFrame(gameLoop);
