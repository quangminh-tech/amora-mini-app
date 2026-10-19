import React, { useState } from "react";
import { Common } from "../types";
import { Row, money } from "../api";
import {
  useLoad,
  useDebounced,
  Pagination,
  ErrorBox,
  Loading,
  Empty,
} from "../components/UI";
import { CtvPolicy } from "../components/CtvPolicy";
export function CtvPrices({ revision, launch }: Common) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const term = useDebounced(search);
  const { data, error, loading } = useLoad<Row>(
    `/products?page=${page}&pageSize=20&search=${encodeURIComponent(term)}`,
    revision,
  );
  return (
    <>
      <div className="ctv-welcome">
        <div>
          <h2>Chọn đúng hàng, báo đúng giá ✦</h2>
          <p>
            Giá lẻ ở bảng dưới. Với khách sỉ hoặc doanh nghiệp, nhập số lượng
            tại Báo giá để biết bậc giá và hoa hồng được áp dụng.
          </p>
        </div>
        <CtvPolicy revision={revision} />
      </div>
      <div className="toolbar">
        <input
          aria-label="Tìm giá sản phẩm"
          placeholder="Tìm tên, mùi, size, màu…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <button className="primary" onClick={() => launch?.("quotes", "new")}>
          Tạo báo giá →
        </button>
      </div>
      <ErrorBox error={error} />
      <div className="panel table-wrap">
        {loading ? (
          <Loading />
        ) : data?.products.length ? (
          <table>
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Quy cách</th>
                <th>Giá lẻ</th>
                <th>Hoa hồng dự kiến / sản phẩm</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p: Row) => {
                const price = data.prices.find(
                  (x: Row) => x.product_id === p.id && x.channel === "retail",
                );
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.model_name}</strong>
                      <small className="muted block">{p.sku}</small>
                    </td>
                    <td>
                      {[p.scent_name, p.size_label, p.color_label]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                    <td>
                      {price ? money(price.unit_price) : "Đang cập nhật"}
                      {price && (
                        <small className="block muted">
                          Từ {price.min_qty} {p.unit}
                        </small>
                      )}
                    </td>
                    <td>
                      {price ? (
                        <>
                          {price.commission_rate}% ·{" "}
                          {money(
                            Math.round(
                              (Number(price.unit_price) *
                                Number(price.commission_rate)) /
                                100,
                            ),
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          !error && <Empty text="Chưa có sản phẩm phù hợp." />
        )}
      </div>
      <Pagination data={data} loading={loading} page={page} setPage={setPage} />
      <p className="muted">
        Số tiền theo một sản phẩm chỉ để tham khảo. Khi báo nhiều sản phẩm, hệ
        thống tính và làm tròn hoa hồng theo từng dòng.
      </p>
    </>
  );
}
