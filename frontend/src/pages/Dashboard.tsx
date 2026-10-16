import React, { useEffect, useState, FormEvent, ReactNode } from "react";
import {
  api,
  request,
  token,
  User,
  Row,
  money,
  date,
  labels,
  parse,
  downloadBlob,
} from "../api";
import {
  Icon,
  Badge,
  Empty,
  Field,
  Modal,
  ErrorBox,
  ProductImage,
  useLoad,
} from "../components/UI";
import { Common } from "../types";
export function Dashboard({
  revision,
  navigate,
}: Common & { navigate: (s: string) => void }) {
  const { data: d, error } = useLoad<Row>("/dashboard", revision);
  if (!d) return <ErrorBox error={error} />;
  const cards = [
    [
      "Doanh thu đơn hoàn tất",
      d.stats.revenue,
      "Theo ngày hoàn tất đơn",
      "orders",
    ],
    [
      "Đơn hàng trong tháng",
      d.stats.orders_month,
      `${d.stats.pending} đơn chờ xác nhận`,
      "orders",
    ],
    [
      "Hoa hồng cần thanh toán",
      d.commissions.outstanding,
      "Lũy kế chờ duyệt và đã duyệt",
      "commissions",
    ],
    [
      "Tiền đã thu trong tháng",
      d.stats.collected,
      "Theo tháng tạo đơn, trừ hủy/trả",
      "orders",
    ],
  ];
  const max = Math.max(1, ...d.trend.map((t: Row) => Number(t.revenue)));
  return (
    <>
      <ErrorBox error={error} />
      <div className="metrics">
        {cards.map(([title, value, note, link]) => (
          <button key={title} className="metric" onClick={() => navigate(link)}>
            <div>
              {title}
              <Icon name={link} />
            </div>
            <strong>
              {title === "Đơn hàng trong tháng" ? value : money(value)}
            </strong>
            <small>{note}</small>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Nhịp kinh doanh</h2>
              <p>Doanh thu theo ngày hoàn tất · 7 ngày</p>
            </div>
            <span className="small-pill">7 ngày gần đây</span>
          </div>
          <div className="bars">
            {d.trend.map((t: Row) => (
              <div className="bar-col" key={t.day}>
                <span>{Number(t.revenue) > 0 ? money(t.revenue) : "—"}</span>
                <div className="bar-track">
                  <div
                    style={{
                      height:
                        Math.max(2, (Number(t.revenue) / max) * 100) + "%",
                    }}
                  />
                </div>
                <small>{t.day}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="ritual-panel">
          <p className="eyebrow">A MOMENT OF CLARITY</p>
          <h2>
            Ít hơn.
            <br />
            <i>Nhưng đúng hơn.</i>
          </h2>
          <p>
            Mỗi đơn hàng là một lời hẹn.
            <br />
            Mỗi trải nghiệm là một điều được chăm chút.
          </p>
          <button onClick={() => navigate("quotes")}>
            Tạo một báo giá mới <span>↗</span>
          </button>
        </section>
      </div>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Đơn hàng gần đây</h2>
            <p>Những kết nối đang được tiếp nối.</p>
          </div>
          <button className="ghost" onClick={() => navigate("orders")}>
            Xem tất cả →
          </button>
        </div>
        {d.recent.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Khách hàng</th>
                  <th>Ngày tạo</th>
                  <th>Giá trị</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {d.recent.map((r: Row) => (
                  <tr key={r.id}>
                    <td className="code">{r.code}</td>
                    <td>{r.customer_name}</td>
                    <td>{date(r.created_at)}</td>
                    <td>{money(r.total)}</td>
                    <td>
                      <Badge value={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Chưa có đơn hàng. Bắt đầu từ sản phẩm và bảng giá." />
        )}
      </section>
    </>
  );
}
