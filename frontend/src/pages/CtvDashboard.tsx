import React from "react";
import { Row, User, money, date } from "../api";
import { Badge, ErrorBox, Loading, Empty } from "../components/UI";
import { CtvPolicy } from "../components/CtvPolicy";
type Props = {
  user: User;
  data: Row | null;
  error: string;
  loading: boolean;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  navigate: (v: string) => void;
  launch?: (v: string, id?: string) => void;
  revision: number;
};
export function CtvDashboard({
  user,
  data: d,
  error,
  loading,
  from,
  to,
  setFrom,
  setTo,
  navigate,
  launch,
  revision,
}: Props) {
  const created = Number(d?.quotes.created || 0),
    accepted = Number(d?.quotes.accepted || 0),
    completed = Number(d?.orders.completed || 0);
  const milestones = [
    { ok: created > 0, title: "Đã bắt đầu", text: "Tạo báo giá trong kỳ" },
    {
      ok: accepted > 0,
      title: "Khách tin chọn",
      text: "Có báo giá được chấp nhận",
    },
    { ok: completed > 0, title: "Trọn lời hẹn", text: "Có đơn hàng hoàn tất" },
  ];
  return (
    <div className="ctv-dashboard">
      <div className="ctv-welcome">
        <div>
          <p className="eyebrow">
            GÓC NHỎ CỦA {user.name.toLocaleUpperCase("vi-VN")}
          </p>
          <h2>Mỗi lời tư vấn, một bước tiến ✦</h2>
          <p>
            Thành tích của riêng bạn. Những con số nhỏ, những bước đi đều đặn.
          </p>
        </div>
        <div className="quick-actions">
          <button
            className="primary"
            onClick={() =>
              launch ? launch("quotes", "new") : navigate("quotes")
            }
          >
            + Báo giá mới
          </button>
          <CtvPolicy revision={revision} />
        </div>
      </div>
      <div className="dashboard-filters">
        <label>
          Từ ngày
          <input
            aria-label="Thành tích từ ngày"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Đến ngày
          <input
            aria-label="Thành tích đến ngày"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="ghost"
          onClick={() => {
            const today = new Date(Date.now() + 7 * 3600e3)
              .toISOString()
              .slice(0, 10);
            setFrom(today.slice(0, 7) + "-01");
            setTo(today);
          }}
        >
          Tháng này
        </button>
        <small className="muted">
          Thành tích theo kỳ · Số dư hoa hồng hiện tại
        </small>
      </div>
      <ErrorBox error={error} />
      {loading && <Loading />}
      {d && (
        <>
          <div className="ctv-stats">
            {[
              {
                label: "Báo giá đã tạo",
                value: created,
                note: "Theo ngày tạo trong kỳ",
                page: "quotes",
                symbol: "✎",
              },
              {
                label: "Đơn đã hoàn tất",
                value: completed,
                note: "Theo ngày hoàn tất trong kỳ",
                page: "orders",
                symbol: "✿",
              },
              {
                label: "Tiền hàng hoàn tất",
                value: money(d.orders.revenue),
                note: "Trong kỳ · không gồm vận chuyển",
                page: "orders",
                symbol: "↗",
              },
              {
                label: "Hoa hồng chờ nhận",
                value: money(
                  Number(d.commissions.pending) +
                    Number(d.commissions.approved),
                ),
                note: "Chờ duyệt + đã duyệt · hiện tại",
                page: "commissions",
                symbol: "♡",
              },
            ].map((c) => (
              <button
                className="ctv-stat"
                key={c.label}
                onClick={() => navigate(c.page)}
              >
                <span className="stat-symbol">{c.symbol}</span>
                <span>{c.label}</span>
                <strong>{c.value}</strong>
                <small>{c.note}</small>
              </button>
            ))}
          </div>
          <div className="ctv-middle">
            <section className="panel">
              <h3>Dấu mốc của bạn</h3>
              <div className="milestones">
                {milestones.map((m) => (
                  <div
                    className={m.ok ? "milestone reached" : "milestone"}
                    key={m.title}
                  >
                    <span>{m.ok ? "✦" : "○"}</span>
                    <strong>{m.title}</strong>
                    <small>{m.text}</small>
                    <small>
                      {m.ok ? "Đã đạt trong kỳ" : "Chưa đạt trong kỳ"}
                    </small>
                  </div>
                ))}
              </div>
              <p className="muted">
                Ghi nhận theo dữ liệu trong khoảng ngày đã chọn, không phải bảng
                xếp hạng.
              </p>
            </section>
            <section className="panel">
              <h3>Ví hoa hồng của bạn</h3>
              {[
                ["pending", "Chờ quản lý duyệt"],
                ["approved", "Đã duyệt, chờ chi"],
                ["paid", "Đã chi lũy kế"],
              ].map(([k, label]) => (
                <div className="wallet-row" key={k}>
                  <span>{label}</span>
                  <strong>{money(d.commissions[k])}</strong>
                </div>
              ))}
              <button className="ghost" onClick={() => navigate("commissions")}>
                Xem từng khoản →
              </button>
            </section>
          </div>
          <section className="panel ctv-recent">
            <div className="section-title">
              <h3>Tiếp tục chăm sóc khách</h3>
              <div className="quick-actions">
                <span>{d.live.waiting} báo giá chờ phản hồi</span>
                <button className="ghost" onClick={() => navigate("orders")}>
                  {d.orders.processing} đơn đang xử lý →
                </button>
              </div>
            </div>
            <div className="table-wrap">
              {d.recent.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Khách / báo giá</th>
                      <th>Giá trị</th>
                      <th>Ngày tạo</th>
                      <th>Trạng thái</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.recent.map((q: Row) => (
                      <tr key={q.id}>
                        <td>
                          <strong>{q.customer_name}</strong>
                          <small className="block muted">{q.code}</small>
                        </td>
                        <td>{money(q.total)}</td>
                        <td>{date(q.created_at)}</td>
                        <td>
                          <Badge value={q.status} />
                        </td>
                        <td>
                          <button
                            className="ghost"
                            onClick={() =>
                              launch
                                ? launch("quotes", q.id)
                                : navigate("quotes")
                            }
                          >
                            Mở →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty text="Chưa có báo giá trong kỳ. Bắt đầu bằng việc chọn sản phẩm và tạo báo giá đầu tiên nhé." />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
