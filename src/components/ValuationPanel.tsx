import type { Valuation } from "@/lib/plush/valuation";
import { multiplier, twd } from "@/lib/format";

/**
 * 估值明細。
 *
 * 刻意把每一項係數攤開來給收藏者看——收藏圈最忌諱黑箱報價，
 * 能看到「為什麼是這個數字」才有辦法判斷該不該信。
 */
export function ValuationPanel({ valuation }: { valuation: Valuation }) {
  const { market } = valuation;

  return (
    <section className="panel">
      <h2>估值明細</h2>
      <div className="value-headline">{twd(valuation.midTwd)}</div>
      <div className="value-range">
        區間 {twd(valuation.lowTwd)} – {twd(valuation.highTwd)}　·　主要市場約 {market.symbol}
        {market.mid.toLocaleString("en-US")} {market.currency}（匯率 {market.rate}）
      </div>

      <div className="factor-list" style={{ marginTop: 16 }}>
        <div className="factor">
          <div>
            <div>產品線基準行情</div>
            <div className="why">該產品線在二手市場的一般行情</div>
          </div>
          <div className="mult">{twd(valuation.baseTwd)}</div>
        </div>
        {valuation.factors.map((factor) => (
          <div className="factor" key={factor.labelZh}>
            <div>
              <div>{factor.labelZh}</div>
              <div className="why">{factor.detailZh}</div>
            </div>
            <div className="mult">{multiplier(factor.multiplier)}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.6, marginBottom: 0, marginTop: 14 }}>
        估值是依產品線行情與各項係數推算的參考值，不是成交保證。實際出手前建議對照
        Mercari 的「売り切れ」或駿河屋的買取價查近期行情。
      </p>
    </section>
  );
}
