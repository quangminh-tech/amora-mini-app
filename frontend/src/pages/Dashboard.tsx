import React, { useState } from "react";
import { Common } from "../types";
import { Row, money, date, labels } from "../api";
import {
  useLoad,
  useDebounced,
  ErrorBox,
  Empty,
  Badge,
  Icon,
  Loading,
} from "../components/UI";
const localDate = () =>
  new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
export function Dashboard({
  user,
  revision,
  navigate,
  launch,
}: Common & { navigate: (s: string) => void }) {
  const today = localDate();
  const [from, setFrom] = useState(today.slice(0, 7) + "-01"),
    [to, setTo] = useState(today),
    [owner, setOwner] = useState(""),
    [ctvSearch, setCtvSearch] = useState("");
  const term = useDebounced(ctvSearch),
    manager = user.role === "manager";
  const {
      data: d,
      error,
      loading,
    } = useLoad<Row>(
      `/overview?from=${from}&to=${to}&ownerId=${owner}`,
      revision,
    ),
    { data: users } = useLoad<Row[]>(
      manager
        ? "/admin/users?pageSize=30&search=" + encodeURIComponent(term)
        : "/scents",
      revision,
    );
  const cards = d
    ? [
        {
          label: "Báo giá tạo trong kỳ",
          value: d.quotes.created,
          note: "Theo ngày tạo báo giá",
          page: "quotes",
          number: true,
        },
        {
          label: "Báo giá chờ phản hồi",
          value: d.live.waiting,
          note: "Hiện tại · còn hiệu lực",
          page: "quotes",
          number: true,
        },
        {
          label: "Tiền hàng hoàn tất",
          value: d.orders.revenue,
          note: "Theo ngày hoàn tất · không gồm vận chuyển",
          page: "orders",
        },
        {
          label: "Hoa hồng chưa chi",
          value: Number(d.commissions.pending) + Number(d.commissions.approved),
          note: "Số dư hiện tại · chờ duyệt và đã duyệt",
          page: "commissions",
        },
      ]
    : [];
  return (
    <>
      <div className="overview-heading">
        <div>
          <p className="eyebrow">
            {manager ? "ĐIỀU HÀNH CỘNG TÁC VIÊN" : "KẾT QUẢ CỦA BẠN"}
          </p>
          <h2>Báo giá và kết quả kinh doanh</h2>
          <p className="muted">
            {manager
              ? "Theo dõi kết quả và những việc cần xử lý trong cùng một màn hình."
              : "Sản phẩm, báo giá và hoa hồng thuộc tài khoản của bạn."}
          </p>
        </div>
        <div className="quick-actions">
          <button className="primary" onClick={() => navigate("quotes")}>
            Báo giá →
          </button>
          <button className="secondary" onClick={() => navigate("products")}>
            Danh mục sản phẩm
          </button>
        </div>
      </div>
      <div className="dashboard-filters">
        <label>
          Từ ngày
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {manager && (
          <label>
            CTV / người phụ trách
            <div className="ctv-filter">
              <input
                aria-label="Tìm CTV tổng quan"
                placeholder="Tìm tên / email…"
                value={ctvSearch}
                onChange={(e) => setCtvSearch(e.target.value)}
              />
              <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">Tất cả thành viên</option>
                {owner && !users?.some((u) => u.id === owner) && (
                  <option value={owner}>Người đã chọn</option>
                )}
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
        )}
        <button
          className="ghost"
          onClick={() => {
            setFrom(today.slice(0, 7) + "-01");
            setTo(today);
          }}
        >
          Tháng này
        </button>
      </div>
      <ErrorBox error={error} />
      {loading && <Loading />}
      {d && (
        <>
          <div className="metrics">
            {cards.map((card) => (
              <button
                className="metric"
                key={card.label}
                onClick={() => navigate(card.page)}
              >
                <div>
                  {card.label}
                  <Icon name={card.page} />
                </div>
                <strong>{card.number ? card.value : money(card.value)}</strong>
                <small>{card.note}</small>
              </button>
            ))}
          </div>
          <div className="dashboard-alerts">
            <button onClick={() => navigate("quotes")}>
              <span className="alert-mark">!</span>
              <span>
                <strong>{d.live.expired}</strong> báo giá đã gửi, đã hết hạn
              </span>
              <span>→</span>
            </button>
            <button onClick={() => navigate("orders")}>
              <span className="alert-mark neutral">↗</span>
              <span>
                <strong>{d.orders.processing}</strong> đơn đang xử lý
              </span>
              <span>→</span>
            </button>
            {manager && (
              <button onClick={() => navigate("prices")}>
                <span className="alert-mark">!</span>
                <span>
                  <strong>{d.missingPrices}</strong> SKU đang bật chưa có giá lẻ
                </span>
                <span>→</span>
              </button>
            )}
          </div>
          <div className="overview-grid">
            <section className="panel">
              <div className="section-title">
                <div>
                  <h2>Báo giá gần đây</h2>
                  <p>Theo ngày tạo trong khoảng đã chọn</p>
                </div>
                <button className="ghost" onClick={() => navigate("quotes")}>
                  Tất cả →
                </button>
              </div>
              {d.recent.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Mã / ngày</th>
                        <th>Người nhận</th>
                        {manager && <th>Người phụ trách</th>}
                        <th>Giá trị</th>
                        <th>Hiệu lực</th>
                        <th>Trạng thái</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {d.recent.map((q: Row) => (
                        <tr key={q.id}>
                          <td>
                            <strong className="code">{q.code}</strong>
                            <small className="muted block">
                              {date(q.created_at)}
                            </small>
                          </td>
                          <td>{q.customer_name}</td>
                          {manager && <td>{q.owner_name}</td>}
                          <td>{money(q.total)}</td>
                          <td>{date(q.valid_until)}</td>
                          <td>
                            <Badge value={q.status} />
                            {q.status === "sent" &&
                              q.valid_until.slice(0, 10) < today && (
                                <small className="danger block">Hết hạn</small>
                              )}
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
                </div>
              ) : (
                <Empty text="Chưa có báo giá trong khoảng đã chọn. Tạo báo giá sau khi thiết lập SKU và giá." />
              )}
            </section>
            <section className="panel distribution">
              <div className="section-title">
                <div>
                  <h2>Tình trạng báo giá</h2>
                  <p>Những báo giá được tạo trong kỳ</p>
                </div>
              </div>
              {[
                ["draft", "Bản nháp"],
                ["sent", "Đã gửi"],
                ["accepted", "Đã chấp nhận"],
                ["rejected", "Đã từ chối"],
              ].map(([k, v]) => (
                <div className="distribution-row" key={k}>
                  <div>
                    <span>{v}</span>
                    <strong>{d.quotes[k]}</strong>
                  </div>
                  <div className="distribution-track">
                    <span
                      className={k}
                      style={{
                        width:
                          (Number(d.quotes.created)
                            ? (Number(d.quotes[k]) / Number(d.quotes.created)) *
                              100
                            : 0) + "%",
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="overview-note">
                {manager
                  ? `${d.activeCtvs} CTV đang hoạt động toàn hệ thống`
                  : "Chỉ hiển thị dữ liệu thuộc bạn"}
              </div>
            </section>
          </div>
          {manager ? (
            <section className="panel">
              <div className="section-title">
                <div>
                  <h2>Kết quả cộng tác viên</h2>
                  <p>
                    Tối đa 10 CTV theo tiền hàng hoàn tất · các cột báo giá theo
                    ngày tạo, đơn theo ngày hoàn tất
                  </p>
                </div>
                <button className="ghost" onClick={() => navigate("users")}>
                  Quản lý CTV →
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cộng tác viên</th>
                      <th>Báo giá trong kỳ</th>
                      <th>Được chấp nhận</th>
                      <th>Đơn hoàn tất</th>
                      <th>Tiền hàng hoàn tất</th>
                      <th>Hoa hồng chưa chi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.team.map((u: Row) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name}</strong>
                          {!u.active && (
                            <small className="muted block">Đã khóa</small>
                          )}
                        </td>
                        <td>{u.quotes_count}</td>
                        <td>{u.accepted}</td>
                        <td>{u.completed}</td>
                        <td>{money(u.revenue)}</td>
                        <td>{money(u.outstanding)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!d.team.length && (
                  <Empty text="Chưa có CTV phù hợp. Cấp tài khoản tại mục Cộng tác viên." />
                )}
              </div>
            </section>
          ) : (
            <section className="panel">
              <div className="section-title">
                <h2>Hoa hồng của bạn</h2>
                <button
                  className="ghost"
                  onClick={() => navigate("commissions")}
                >
                  Xem chi tiết →
                </button>
              </div>
              <div className="commission-summary">
                {[
                  ["pending", "Chờ duyệt"],
                  ["approved", "Đã duyệt, chờ chi"],
                  ["paid", "Đã chi lũy kế"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span>{v}</span>
                    <strong>{money(d.commissions[k])}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
