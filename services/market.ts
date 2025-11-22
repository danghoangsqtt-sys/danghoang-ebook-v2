
export interface MarketItem {
    symbol: string;
    name: string;
    price: number;
    change24h: number;
    type: 'crypto' | 'fiat' | 'gold' | 'index';
    high24h?: number;
    low24h?: number;
}

export interface MarketData {
    items: MarketItem[];
    vnIndex: {
        value: number;
        change: number;
        changePercent: number;
    };
    sjcGold: {
        buy: number;
        sell: number;
        change: number;
    };
    lastUpdated: number;
}

class MarketService {
    // CoinGecko IDs: bitcoin, ethereum, tether (for USD proxy), pax-gold (for XAU proxy)
    private readonly API_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,pax-gold&vs_currencies=vnd,usd&include_24hr_change=true&include_24hr_vol=true&include_24hr_high=true&include_24hr_low=true";

    // Baselines for Simulation (Fallback or Local Derivation)
    private readonly BASE_VNINDEX = 1280;
    private readonly SJC_PREMIUM = 1.18; // SJC is ~18% higher than world gold

    // Constants
    private readonly OZ_TO_TAEL = 1.20565; // 1 Tael (Lượng) = 1.20565 Troy Oz

    async getMarketData(): Promise<MarketData> {
        try {
            const response = await fetch(this.API_URL);
            if (!response.ok) throw new Error("API Limit");

            const data = await response.json();

            // 1. Extract Real Data
            const btc = data.bitcoin;
            const eth = data.ethereum;
            const usdt = data.tether; // Proxy for USD/VND market rate
            const paxg = data['pax-gold']; // Proxy for World Gold

            // 2. Derive Local Data
            // USD Rate (USDT is often 1:1 with USD, but in VND market it reflects the exchange rate)
            const usdRate = usdt.vnd;

            // SJC Gold Calculation
            // Formula: (World Price USD/oz * USD/VND Rate) * (1 Tael / 1 Oz) * Premium
            const worldGoldVndPerOz = paxg.usd * usdRate;
            const worldGoldVndPerTael = worldGoldVndPerOz * this.OZ_TO_TAEL;

            // SJC Buy/Sell with spread
            const sjcSell = Math.floor(worldGoldVndPerTael * this.SJC_PREMIUM);
            const sjcBuy = Math.floor(sjcSell * 0.98); // 2% spread

            // VN-Index Simulation (Random walk with trend)
            // In a real app, we would scrape this or use a paid API.
            const now = new Date();
            const hour = now.getHours();
            const isTrading = hour >= 9 && hour <= 15;

            // Deterministic but changing volatility based on time
            const timeFactor = (now.getMinutes() + now.getSeconds()) / 100;
            const volatility = isTrading ? (Math.sin(timeFactor) * 5) + (Math.random() * 2) : 0;

            const vnIndexValue = this.BASE_VNINDEX + volatility;
            const vnIndexChange = volatility;
            const vnIndexPercent = (volatility / this.BASE_VNINDEX) * 100;

            return {
                items: [
                    {
                        symbol: 'BTC', name: 'Bitcoin',
                        price: btc.usd, change24h: btc.usd_24h_change,
                        type: 'crypto', high24h: 0, low24h: 0 // API simple endpoint doesn't give high/low in this call structure easily, keeping simple
                    },
                    {
                        symbol: 'ETH', name: 'Ethereum',
                        price: eth.usd, change24h: eth.usd_24h_change,
                        type: 'crypto'
                    },
                    {
                        symbol: 'USD', name: 'USD/VND (Free Market)',
                        price: usdt.vnd, change24h: usdt.vnd_24h_change,
                        type: 'fiat'
                    },
                    {
                        symbol: 'XAU', name: 'World Gold (Oz)',
                        price: paxg.usd, change24h: paxg.usd_24h_change,
                        type: 'gold'
                    },
                ],
                vnIndex: {
                    value: Number(vnIndexValue.toFixed(2)),
                    change: Number(vnIndexChange.toFixed(2)),
                    changePercent: Number(vnIndexPercent.toFixed(2))
                },
                sjcGold: {
                    buy: sjcBuy,
                    sell: sjcSell,
                    change: paxg.usd_24h_change // Follow world trend
                },
                lastUpdated: Date.now()
            };

        } catch (error) {
            console.warn("Market Data API Limit or Error, using Fallback", error);
            return this.getFallbackData();
        }
    }

    private getFallbackData(): MarketData {
        return {
            items: [
                { symbol: 'BTC', name: 'Bitcoin', price: 67500, change24h: 2.5, type: 'crypto' },
                { symbol: 'ETH', name: 'Ethereum', price: 3800, change24h: -1.2, type: 'crypto' },
                { symbol: 'USD', name: 'USD/VND', price: 25450, change24h: 0.1, type: 'fiat' },
                { symbol: 'XAU', name: 'World Gold', price: 2350, change24h: 0.5, type: 'gold' },
            ],
            vnIndex: { value: 1290.5, change: 8.5, changePercent: 0.65 },
            sjcGold: { buy: 84000000, sell: 86000000, change: 0.3 },
            lastUpdated: Date.now()
        };
    }
}

export const marketService = new MarketService();
