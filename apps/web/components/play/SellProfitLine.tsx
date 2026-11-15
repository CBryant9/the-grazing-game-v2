import { money } from '@/lib/game/format';
import type { SellMoneyWire } from '@/lib/game/types';
import { profitText } from './StockBook';
import styles from './SellProfitLine.module.css';

/**
 * The money line for a Sell row (mockup C, "Bought for · profit $/head"):
 * "Bought for $1,050, $40 spent since · profit +$266/head". Takes a Sell
 * row's `money` (`SellGroupWire.money` on a mob card, `SellClassWire.money`
 * on the Market's Sell list) and shows nothing when it is null.
 *
 * Mount: `<SellProfitLine money={group.money} />` inside the Sell card or row.
 */
export function SellProfitLine({ money: m }: { money: SellMoneyWire | null }) {
  if (!m) return null;
  const paid = m.paidText === 'Bred here' ? 'Bred here' : `${m.paidText} ${money(m.paidPerHead)}`;
  const spent = m.spentPerHead >= 1 ? `, ${money(m.spentPerHead)} spent since` : '';
  const tone = m.profitPerHead > 0 ? styles.up : m.profitPerHead < 0 ? styles.down : undefined;
  return (
    <p className={styles.line}>
      <span className={styles.muted}>
        {paid}
        {spent}
      </span>
      <span aria-hidden="true"> · </span>
      <span className={styles.srOnly}>, </span>
      <span>
        profit <b className={tone}>{profitText(m.profitPerHead)}</b>/head
      </span>
    </p>
  );
}
