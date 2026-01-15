import { Groq } from 'groq-sdk';

let groq: Groq | null = null;

export function evaluateSwingRules(data: any) {
  const {
    price, ema9, ema21, ema50,
    macd, macdSignal,
    adx, volume, avgVolume20
  } = data;

  const trendBullish = ema9 > ema50;
  const trendBearish = ema9 < ema50;

  const momentumBullish = macd > macdSignal;
  const momentumBearish = macd < macdSignal;

  const activeTrend = adx > 25;

  const structureBullish =
    price > ema21 && ema9 > ema21;

  const structureBearish =
    price < ema21 && ema9 < ema21;

  const volumeConfirmed = volume > avgVolume20;

  // ENTRY ELIGIBILITY (hard rules)
  const buyAllowed =
    trendBullish &&
    momentumBullish &&
    activeTrend &&
    structureBullish &&
    volumeConfirmed;

  const sellAllowed =
    trendBearish &&
    momentumBearish &&
    activeTrend &&
    structureBearish &&
    volumeConfirmed;

  let swingBias: 'Buy' | 'Sell' | 'No Trade' = 'No Trade';

  if (buyAllowed) swingBias = 'Buy';
  else if (sellAllowed) swingBias = 'Sell';

  return {
    swingBias,
    flags: {
      trendBullish,
      trendBearish,
      momentumBullish,
      momentumBearish,
      activeTrend,
      structureBullish,
      structureBearish,
      volumeConfirmed
    }
  };
}

function getGroqClient(): Groq {
    if (!groq) {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new Error('GROQ_API_KEY environment variable is not set');
        }
        groq = new Groq({ apiKey });
    }
    return groq;
}

export async function askGroqForTechnicalsAnalysis(symbol: string, data: any): Promise<string> {
    const evaluation = evaluateSwingRules(data);

    const llmInput = `
Symbol: ${symbol}

Final Swing Bias (NON-NEGOTIABLE): ${evaluation.swingBias}

Verified Conditions:
- Bullish Trend (EMA9 > EMA50): ${evaluation.flags.trendBullish}
- Bearish Trend (EMA9 < EMA50): ${evaluation.flags.trendBearish}
- Bullish Momentum (MACD > Signal): ${evaluation.flags.momentumBullish}
- Bearish Momentum (MACD < Signal): ${evaluation.flags.momentumBearish}
- Active Trend (ADX > 25): ${evaluation.flags.activeTrend}
- Bullish Structure (Price & EMA9 above EMA21): ${evaluation.flags.structureBullish}
- Bearish Structure (Price & EMA9 below EMA21): ${evaluation.flags.structureBearish}
- Volume Above 20D Average: ${evaluation.flags.volumeConfirmed}

Task:
Explain the trade setup CONSISTENT with the Final Swing Bias.
You are FORBIDDEN from changing the bias.
If bias is No Trade, explain which VERIFIED condition failed.
`;

    const chatCompletion = await getGroqClient().chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 400,
        messages: [
            {
                role: 'system',
                content: `You are a disciplined swing trader.

The trade decision is already FINAL.
You must NEVER change the Swing Bias.

Your job is ONLY to:
- Explain why the bias is Buy / Sell / No Trade
- Reference ONLY the verified conditions provided
- Do not invent missing conditions
- Do not perform calculations

RESPONSE FORMAT (STRICT – NO DEVIATION)

Swing Bias: Buy / Sell / No Trade
Entry Zone:
Targets:
Stop Loss:
Confidence (1–5):
Reasoning:

Keep response under 200 words
Plain text only`
            },
            {
                role: 'user',
                content: llmInput
            }
        ]
    });

    let aiResponse = chatCompletion.choices[0]?.message?.content?.trim() || 'AI could not generate a summary.';

    return aiResponse;
}
