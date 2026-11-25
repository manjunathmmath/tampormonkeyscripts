export interface Tip { title: string; body: string; source: string }

/** Concepts worth knowing. Wording is ours; the source line says where the idea is covered in more depth, or that it is plain arithmetic / general knowledge. */
export const TIPS: Tip[] = [
  { title: 'Risk of ruin is arithmetic', body: 'A 50% loss needs a 100% gain to get back. A 10% loss needs 11.1%. The deeper the hole, the harder the climb, which is why limiting the size of any one loss matters more than finding more winners.', source: 'Arithmetic' },
  { title: 'Expectancy: win rate is half the story', body: 'Expectancy per trade = win rate × average win − loss rate × average loss. A 40% win rate with winners twice the size of losers is profitable; a 70% win rate with small winners and large losers can lose money.', source: 'Covered in: Van Tharp, Trade Your Way to Financial Freedom' },
  { title: 'R-multiples', body: 'Measure each trade in units of the amount you risked (1R). A trade that makes twice its risk is +2R. It lets you compare trades of different sizes and see whether your winners are big enough to pay for your losers.', source: 'Covered in: Van Tharp, Trade Your Way to Financial Freedom' },
  { title: 'Position size from the stop', body: 'Quantity = money you accept to lose ÷ (entry − stop). The stop decides the size, not the other way round. A wider stop means fewer lots for the same rupee risk.', source: 'Arithmetic' },
  { title: 'Open interest is not volume', body: 'Volume counts contracts traded in the period. Open interest counts contracts still open. Rising price with rising open interest means new positions are being added; rising price with falling open interest means shorts are closing.', source: 'Covered in: Murphy, Technical Analysis of the Financial Markets' },
  { title: 'Who writes the options matters', body: 'A call wall is a strike with a lot of call open interest. If it was built by sellers, price tends to find it hard to go through; if buyers hold it, it can act as fuel. Volume flow (OBV) at that strike helps tell which.', source: 'General market knowledge, no single source' },
  { title: 'Put-call ratio is a mood, not a signal', body: 'PCR above 1 is normal for index options because puts are bought as hedges. What carries information is the change in PCR on the day (fresh positioning), not the standing level.', source: 'General market knowledge, no single source' },
  { title: 'Implied volatility is a price of insurance', body: 'India VIX is the market\'s implied one-month volatility for Nifty. Dividing by √252 gives a rough one-day move: VIX 16 implies about 1% a day. Realised moves are usually smaller than implied ones.', source: 'Covered in: Natenberg, Option Volatility and Pricing; method: NSE India VIX white paper' },
  { title: 'Theta works for sellers, gamma for buyers', body: 'An option loses time value every day (theta), faster near expiry. Gamma, how fast delta changes, is highest at the money near expiry: that is why expiry-day positions can swing so hard.', source: 'Covered in: Natenberg, Option Volatility and Pricing' },
  { title: 'VWAP is where the day\'s money changed hands', body: 'VWAP is the average price weighted by volume. Price above VWAP means buyers of the day are in profit on average. Institutions often benchmark fills against it, so it acts as a reference level intraday.', source: 'General market knowledge, no single source' },
  { title: 'On-balance volume', body: 'OBV adds the day\'s volume when price closes up and subtracts it when price closes down. Rising OBV with flat price suggests accumulation; falling OBV with rising price warns that the move lacks participation.', source: 'Covered in: Murphy, Technical Analysis of the Financial Markets' },
  { title: 'ATR sizes everything', body: 'Average True Range is the typical range of a candle including gaps. Stops of one to two ATR sit outside normal noise; targets measured in ATR tell you whether a move is ordinary or stretched.', source: 'Covered in: Wilder, New Concepts in Technical Trading Systems' },
  { title: 'Stage analysis', body: 'Stocks cycle through basing, advancing, topping and declining. Buying in an advancing stage (price above a rising 30-week average) keeps you on the side of the trend; the other stages are mostly waiting or avoiding.', source: 'Covered in: Stan Weinstein, Secrets for Profiting in Bull and Bear Markets' },
  { title: 'Relative strength', body: 'A stock that has risen more than the index over 6 to 12 months tends, on average, to keep outperforming for a while. It is one of the more persistent effects in published studies, but it fades and can reverse sharply.', source: 'Covered in: Clenow, Stocks on the Move; background: Jegadeesh and Titman (1993)' },
  { title: 'Survivorship bias', body: 'Testing a rule on today\'s index members ignores the companies that were dropped because they fell. Results look better than a real investor could have had. Always ask what the test left out.', source: 'Covered in: Kahneman, Thinking, Fast and Slow (the general bias); testing practice' },
  { title: 'Costs are a hurdle', body: 'Brokerage, STT, exchange charges, GST and slippage are paid on every round trip. A strategy with a small average gain per trade can disappear after costs, and the more often you trade the more it matters.', source: 'Arithmetic' },
  { title: 'Index funds beat most active managers', body: 'Over long periods, after costs, most actively managed funds trail their index. It is the main argument for keeping a core of low-cost index investing and trading only with a defined edge.', source: 'Covered in: Bogle, The Little Book of Common Sense Investing; Malkiel, A Random Walk Down Wall Street' },
  { title: 'Time in the market', body: 'A few of the best days account for a large share of long-run returns, and they often come close to the worst days. Being out of the market to dodge falls usually means missing those rebounds too.', source: 'Covered in: Housel, The Psychology of Money (the idea); evidence varies by period' },
];

/** Process ideas for studying your own trading. Not signals. */
export const IDEAS: string[] = [
  'Write the reason for a trade in one sentence before you enter. At the end of the week, count how many reasons you actually followed.',
  'Tag every trade with the setup it came from. After 30 trades, look at win rate and average R per setup; drop the worst one for a month.',
  'Note the time of each entry. Do your losses cluster in the first 15 minutes or after 2 pm? If so, a time rule may help more than a new indicator.',
  'Record the stop you planned and the exit you actually made. The gap between them is the cost of not following your own plan.',
  'Pick one rule that you break most often and write it on the screen. Count the breaks, not the profit, for two weeks.',
  'Before the open, write which levels would change your view (a close beyond a wall, a failed breakout). Check them after the close.',
  'After each loss, write whether it was a good trade that lost or a bad trade. Only the second kind needs fixing.',
  'Compare your trades with the dashboard\'s plan for the same name that day. Where did you differ, and who was right?',
  'Trade one size for a month. Then compare results by size; the size at which you start making rushed decisions is your real limit.',
  'Keep a list of trades you skipped. Check later which would have worked; if it is most of them, you are too cautious, if few, the filter is doing its job.',
  'On expiry days, write down in advance your maximum loss for the day, and stop when you reach it.',
  'Check the economic calendar the evening before. Mark the events that land inside market hours and decide whether you will trade through them.',
  'Review one big winner and one big loser each month in detail: what was the plan, what changed, what would you do the same?',
  'Measure how long you hold winners compared with losers. Cutting winners short while holding losers long is one of the most common leaks.',
  'Replace one daily habit of checking prices with a scheduled look at set times, and see whether the quality of your decisions changes.',
];
