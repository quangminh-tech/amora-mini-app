import React, { useState } from "react";
import { Row, labels } from "../api";
import { useLoad, Modal, Loading, ErrorBox } from "./UI";
export function CtvPolicy({ revision = 0 }: { revision?: number }) {
  const [open, setOpen] = useState(false);
  const { data, error, loading } = useLoad<Row>(
    open ? "/pricing/policies" : null,
    revision,
  );
  return (
    <>
      <button type="button" className="secondary" onClick={() => setOpen(true)}>
        ⓘ Chính sách & cách tính
      </button>
      {open && (
        <Modal title="Cùng AMORA bán hàng thật dễ" close={() => setOpen(false)}>
          <div className="policy-guide">
            <p>
              Chọn đúng sản phẩm, nhập số lượng. AMORA tự tính giá được phép
              báo; bạn không cần nhớ từng mức giá.
            </p>
            <ol>
              <li>
                <strong>Chọn nhu cầu khách:</strong> mua lẻ, nhập bán lại hoặc
                quà tặng doanh nghiệp.
              </li>
              <li>
                <strong>Cộng theo nhóm:</strong> các SKU cùng nhóm được cộng số
                lượng; phụ kiện và sáp mini không tự cộng vào nhóm nến hũ.
              </li>
              <li>
                <strong>Xem bậc áp dụng:</strong> hệ thống chọn bậc cao nhất đủ
                số lượng. Chưa đủ hoặc chưa có giá, hệ thống báo rõ để bạn điều
                chỉnh.
              </li>
              <li>
                <strong>Hoa hồng dự kiến:</strong> thành tiền mỗi dòng × tỷ lệ
                của bậc; làm tròn đồng từng dòng rồi cộng lại. Không tính phí
                vận chuyển.
              </li>
            </ol>
            <h3>Chính sách đang được phép dùng</h3>
            <ErrorBox error={error} />
            {loading && <Loading />}
            {data?.policies.length
              ? data.policies.map((p: Row) => {
                  const tiers = data.tiers.filter(
                    (t: Row) => t.policy_id === p.id,
                  );
                  return (
                    <section className="policy-guide-card" key={p.id}>
                      <strong>{p.name}</strong>
                      <small className="block muted">
                        {p.category_name} · {labels[p.channel]}
                      </small>
                      {tiers.map((t: Row, i: number) => (
                        <p key={t.id}>
                          {t.min_qty}
                          {tiers[i + 1]
                            ? `–${tiers[i + 1].min_qty - 1}`
                            : " trở lên"}{" "}
                          sản phẩm cùng nhóm · Hoa hồng {t.commission_rate}%
                        </p>
                      ))}
                    </section>
                  );
                })
              : !loading && (
                  <p>
                    Chưa có chính sách sỉ/doanh nghiệp được bật cho CTV. Bạn vẫn
                    dùng giá lẻ do quản lý thiết lập.
                  </p>
                )}
            <h3>Khi nào hoa hồng được nhận?</h3>
            <p>
              “Dự kiến” giúp bạn tham khảo khi báo giá. Khi đơn hoàn tất và thu
              đủ tiền, hoa hồng chuyển sang chờ duyệt. Quản lý duyệt và ghi nhận
              chi trả; bạn xem từng trạng thái tại mục Hoa hồng. Đơn hủy/trả
              được đối soát theo thực tế.
            </p>
            <p className="notice">
              PDF gửi khách chỉ có sản phẩm, giá và điều kiện bán hàng. Giá vốn
              và hoa hồng nội bộ không xuất hiện trong PDF.
            </p>
            <p>
              Gặp đơn cần giá riêng hoặc yêu cầu in logo/đóng gói? Trao đổi với
              quản lý trước khi cam kết với khách.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
