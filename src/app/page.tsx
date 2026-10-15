import Link from "next/link";
import { listItems } from "@/lib/store";
import { computeStats, itemValueTwd } from "@/lib/plush/stats";
import { twd, signedTwd } from "@/lib/format";
import { CollectionBrowser } from "@/components/CollectionBrowser";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const items = await listItems();
  const stats = computeStats(items);

  const cards = items.map((item) => ({
    id: item.id,
    name: item.name,
    character: item.character,
    catalogNumber: item.catalogNumber,
    series: item.series,
    size: item.size,
    rarity: item.rarity,
    authenticity: item.authenticity,
    isSpecialEdition: item.isSpecialEdition,
    quantity: item.quantity,
    photo: item.photo,
    tags: item.tags,
    valueTwd: itemValueTwd(item),
  }));

  const maxCharacterValue = Math.max(1, ...stats.byCharacter.map((b) => b.valueTwd));
  const maxChannelValue = Math.max(1, ...stats.byChannel.map((b) => b.valueTwd));
  const maxRarityCount = Math.max(1, ...stats.byRarity.map((b) => b.count));

  return (
    <main>
      <section className="stat-grid">
        <div className="stat">
          <div className="label">收藏隻數</div>
          <div className="value">{stats.totalUnits}</div>
          <div className="sub">{stats.totalItems} 個品項</div>
        </div>
        <div className="stat">
          <div className="label">估計總值</div>
          <div className="value">{twd(stats.estimatedValueTwd)}</div>
          <div className="sub">
            {twd(stats.estimatedLowTwd)} – {twd(stats.estimatedHighTwd)}
          </div>
        </div>
        <div className="stat">
          <div className="label">已投入成本</div>
          <div className="value">{twd(stats.investedTwd)}</div>
          <div className="sub">{stats.itemsWithCost} 個品項有記錄</div>
        </div>
        <div className="stat">
          <div className="label">未實現損益</div>
          <div className={`value ${stats.unrealizedGainTwd >= 0 ? "pos" : "neg"}`}>
            {signedTwd(stats.unrealizedGainTwd)}
          </div>
          <div className="sub">僅計算有填購入價的品項</div>
        </div>
        <div className="stat">
          <div className="label">待查證</div>
          <div className={`value ${stats.unverifiedUnits > 0 ? "neg" : ""}`}>{stats.unverifiedUnits}</div>
          <div className="sub">未查證或疑似仿冒的隻數</div>
        </div>
      </section>

      {items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <section className="panel">
            <h2>角色分布（依估值）</h2>
            {stats.byCharacter.map((bucket) => (
              <div key={bucket.key} className="bar-row" title={`${bucket.labelZh}：${bucket.count} 隻，估值 ${twd(bucket.valueTwd)}`}>
                <span className="name">{bucket.labelZh}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${(bucket.valueTwd / maxCharacterValue) * 100}%` }}
                  />
                </span>
                <span className="num">{bucket.count} 隻</span>
              </div>
            ))}
          </section>

          <section className="panel">
            <h2>出處分布（依估值）</h2>
            {stats.byChannel.map((bucket) => (
              <div key={bucket.key} className="bar-row" title={`${bucket.labelZh}：${bucket.count} 隻，估值 ${twd(bucket.valueTwd)}`}>
                <span className="name">{bucket.labelZh}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${(bucket.valueTwd / maxChannelValue) * 100}%` }}
                  />
                </span>
                <span className="num">{bucket.count} 隻</span>
              </div>
            ))}
          </section>

          <section className="panel">
            <h2>稀有度分布</h2>
            {stats.byRarity.map((bucket) => (
              <div key={bucket.key} className="bar-row" title={`${bucket.labelZh}：${bucket.count} 隻`}>
                <span className="name">{bucket.labelZh}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${(bucket.count / maxRarityCount) * 100}%` }}
                  />
                </span>
                <span className="num">{bucket.count} 隻</span>
              </div>
            ))}
          </section>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">
          <p style={{ marginTop: 0, fontSize: 15 }}>收藏庫還是空的。</p>
          <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6 }}>
            抱一隻玩偶出來拍張照，順便把紙吊牌的正反面一起拍進去——
            <br />
            吊牌是判斷出處與真假最準的線索。
          </p>
          <Link href="/scan" className="btn btn-primary" style={{ marginTop: 12 }}>
            開始第一次鑑定
          </Link>
        </div>
      ) : (
        <CollectionBrowser items={cards} />
      )}
    </main>
  );
}
