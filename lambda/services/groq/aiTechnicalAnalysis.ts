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

export function deriveContextualInsights(data: any) {
  const {
    open, high, low, price,
    rsi, atr, macdHistogram,
    bbUpper, bbMiddle, bbLower
  } = data;

  // Candle context
  const candleType = price > open ? 'bullish' : price < open ? 'bearish' : 'doji';
  const candleRange = high - low;
  const upperWick = high - Math.max(open, price);
  const lowerWick = Math.min(open, price) - low;
  const bodySize = Math.abs(price - open);
  const closeNearLow = (price - low) < (high - price);
  const closeNearHigh = (high - price) < (price - low);

  // RSI regime
  let rsiState: 'oversold' | 'neutral' | 'overbought' = 'neutral';
  if (rsi < 30) rsiState = 'oversold';
  else if (rsi > 70) rsiState = 'overbought';

  // Volatility context (simplified - using ATR as proxy)
  let volatility: 'low' | 'normal' | 'high' = 'normal';
  // This is a simplified approach - in production you'd compare to historical ATR
  if (atr > 50) volatility = 'high';
  else if (atr < 20) volatility = 'low';

  // MACD histogram direction
  let momentumAcceleration: 'increasing' | 'decreasing' = 'decreasing';
  if (macdHistogram > 0) momentumAcceleration = 'increasing';

  // Bollinger Band position
  let bbPosition: 'nearLower' | 'middle' | 'nearUpper' = 'middle';
  const bbRange = bbUpper - bbLower;
  const lowerThreshold = bbLower + (bbRange * 0.2);
  const upperThreshold = bbUpper - (bbRange * 0.2);

  if (price <= lowerThreshold) bbPosition = 'nearLower';
  else if (price >= upperThreshold) bbPosition = 'nearUpper';

  return {
    candleType,
    closeNearLow,
    closeNearHigh,
    rsiState,
    volatility,
    momentumAcceleration,
    bbPosition
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
    const insights = deriveContextualInsights(data);

    // Determine which condition failed for No Trade
    let failedCondition = '';
    if (evaluation.swingBias === 'No Trade') {
        if (!evaluation.flags.volumeConfirmed) {
            failedCondition = 'Volume Above 20D Average: false';
        } else {
            // This shouldn't happen with current logic, but fallback
            failedCondition = 'Required conditions not met';
        }
    }

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

${evaluation.swingBias === 'No Trade' ? `Failed Condition: ${failedCondition}` : ''}

Contextual Insights (for explanation only):
- Candle Type: ${insights.candleType}
- Close Near Low: ${insights.closeNearLow}
- Close Near High: ${insights.closeNearHigh}
- RSI State: ${insights.rsiState}
- Volatility: ${insights.volatility}
- Momentum Acceleration: ${insights.momentumAcceleration}
- Bollinger Position: ${insights.bbPosition}

Task:
Explain the trade setup CONSISTENT with the Final Swing Bias.
You are FORBIDDEN from changing the bias.
If bias is No Trade, explain the FAILED CONDITION that prevented the trade.
Use contextual insights ONLY for richer explanation and risk context.
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
- Use contextual insights ONLY for explanation and risk context
- Do not invent missing conditions
- Do not perform calculations
- Contextual insights MUST NOT influence the bias decision
- If Swing Bias is No Trade, you MUST explicitly name ONLY the failed VERIFIED condition(s) that are false. Do not mention satisfied conditions. Do not provide alternative reasons.
- For No Trade: Entry Zone should be "N/A", Targets should be "N/A", Stop Loss should be "N/A", Confidence should be "1"

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
