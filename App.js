import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  StatusBar,
  Platform,
  Modal,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { C, s } from "./styles";

// Collection theo đề: GiangVien, gồm đúng 4 trường: IDGV, Fullname, Image, SumClass
const COL = "GiangVien";
const ADMIN = { user: "admin", pass: "123456" };
const empty = { IDGV: "", Fullname: "", Image: "", SumClass: "" };

const isWeb = Platform.OS === "web";
const notify = (title, msg = "") =>
  isWeb
    ? window.alert(msg ? `${title}\n${msg}` : title)
    : Alert.alert(title, msg);
// Alert.alert có nút bấm không chạy trên web, nên dùng window.confirm
const confirmBox = (title, msg, onOk) => {
  if (isWeb) {
    if (window.confirm(`${title}\n${msg}`)) onOk();
  } else {
    Alert.alert(title, msg, [
      { text: "Hủy", style: "cancel" },
      { text: "Xóa", style: "destructive", onPress: onOk },
    ]);
  }
};

// Bỏ dấu tiếng Việt để tìm "nguyen" ra "Nguyễn"
const norm = (s = "") =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();

function Avatar({ user, size = 52, radius }) {
  const style = { width: size, height: size, borderRadius: radius ?? size / 2 };
  if (user.Image) return <Image source={{ uri: user.Image }} style={style} />;
  const words = (user.Fullname || "?").trim().split(/\s+/);
  return (
    <View style={[style, s.avatarFallback]}>
      <Text
        style={{ color: C.primary, fontWeight: "700", fontSize: size * 0.4 }}
      >
        {words[words.length - 1].charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [login, setLogin] = useState({ user: "", pass: "" });
  const [list, setList] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!loggedIn) return;
    const unsub = onSnapshot(
      collection(db, COL),
      (snap) => {
        const rows = snap.docs.map((d) => d.data());
        rows.sort((a, b) =>
          String(a.IDGV).localeCompare(String(b.IDGV), undefined, {
            numeric: true,
          }),
        );
        setList(rows);
      },
      (err) => notify("Lỗi Firebase", err.message),
    );
    return unsub;
  }, [loggedIn]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return list;
    return list.filter(
      (u) => norm(u.IDGV).includes(q) || norm(u.Fullname).includes(q),
    );
  }, [list, query]);

  const handleLogin = () => {
    if (login.user === ADMIN.user && login.pass === ADMIN.pass)
      setLoggedIn(true);
    else notify("Đăng nhập thất bại", "Sai tài khoản hoặc mật khẩu.");
  };

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.3,
      base64: true,
    });
    if (r.canceled) return;
    const a = r.assets[0];
    setForm({
      ...form,
      Image: a.base64 ? "data:image/jpeg;base64," + a.base64 : a.uri,
    });
  };

  const closeForm = () => {
    setForm(empty);
    setEditId(null);
    setShowForm(false);
  };

  const save = async () => {
    const id = form.IDGV.trim();
    const name = form.Fullname.trim();
    const sum = String(form.SumClass).trim();
    if (!id || !name || !sum)
      return notify("Thiếu thông tin", "Nhập đủ IDGV, Fullname và SumClass.");
    if (!/^[A-Za-z0-9_-]+$/.test(id))
      return notify(
        "IDGV không hợp lệ",
        "Chỉ dùng chữ, số, dấu - hoặc _ (không dấu cách).",
      );
    if (!/^\d+$/.test(sum))
      return notify(
        "SumClass không hợp lệ",
        "Tổng số lớp phải là số nguyên >= 0.",
      );
    if (!editId && list.some((u) => u.IDGV === id))
      return notify("Trùng mã giảng viên", `IDGV "${id}" đã tồn tại.`);

    const data = {
      IDGV: id,
      Fullname: name,
      Image: form.Image,
      SumClass: Number(sum),
    };
    try {
      if (editId) await updateDoc(doc(db, COL, editId), data);
      else await setDoc(doc(db, COL, id), data); // dùng IDGV làm id document để không bị trùng
      closeForm();
    } catch (e) {
      notify("Lỗi", e.message);
    }
  };

  const remove = (u, onDone) =>
    confirmBox(
      "Xóa giảng viên",
      `Xóa "${u.Fullname}" (${u.IDGV})? Không thể hoàn tác.`,
      () =>
        deleteDoc(doc(db, COL, u.IDGV))
          .then(() => onDone && onDone())
          .catch((e) => notify("Lỗi", e.message)),
    );

  const edit = (u) => {
    setEditId(u.IDGV);
    setForm({
      IDGV: u.IDGV,
      Fullname: u.Fullname,
      Image: u.Image || "",
      SumClass: String(u.SumClass ?? ""),
    });
    setShowForm(true);
  };

  // Xuất file CSDL (json) để nộp theo yêu cầu đề — chỉ chạy trên web
  const exportJson = () => {
    const data = list.map(({ IDGV, Fullname, Image, SumClass }) => ({
      IDGV,
      Fullname,
      Image,
      SumClass,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "GiangVien.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------- Đăng nhập ----------
  if (!loggedIn)
    return (
      <View style={s.loginWrap}>
        <StatusBar barStyle="light-content" backgroundColor={C.primary} />
        <View style={s.loginBox}>
          <Text style={s.brand}>Quản lý giảng viên</Text>
          <Text style={s.brandSub}>QLHocPhan · Đăng nhập quản trị</Text>
          <View style={s.loginCard}>
            <Text style={s.label}>Tài khoản</Text>
            <TextInput
              style={s.input}
              placeholder="admin"
              autoCapitalize="none"
              placeholderTextColor={C.muted}
              onChangeText={(t) => setLogin({ ...login, user: t })}
            />
            <Text style={s.label}>Mật khẩu</Text>
            <TextInput
              style={s.input}
              placeholder="••••••"
              secureTextEntry
              placeholderTextColor={C.muted}
              onChangeText={(t) => setLogin({ ...login, pass: t })}
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity style={s.btn} onPress={handleLogin}>
              <Text style={s.btnText}>Đăng nhập</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );

  // ---------- Form thêm / sửa ----------
  const formView = showForm ? (
    <View style={s.formCard}>
      <Text style={s.formTitle}>
        {editId ? "Sửa giảng viên" : "Thêm giảng viên"}
      </Text>

      <TouchableOpacity onPress={pickImage} style={s.pickWrap}>
        <Avatar
          user={{ Fullname: form.Fullname, Image: form.Image }}
          size={80}
        />
        <Text style={s.pickText}>{form.Image ? "Đổi ảnh" : "Chọn ảnh"}</Text>
      </TouchableOpacity>

      <Text style={s.label}>IDGV (mã giảng viên)</Text>
      <TextInput
        style={[s.input, editId && s.inputLocked]}
        value={form.IDGV}
        placeholder="GV001"
        placeholderTextColor={C.muted}
        autoCapitalize="characters"
        editable={!editId}
        onChangeText={(t) => setForm({ ...form, IDGV: t })}
      />
      <Text style={s.label}>Fullname (họ và tên)</Text>
      <TextInput
        style={s.input}
        value={form.Fullname}
        placeholder="Nguyễn Văn A"
        placeholderTextColor={C.muted}
        onChangeText={(t) => setForm({ ...form, Fullname: t })}
      />
      <Text style={s.label}>SumClass (tổng số lớp)</Text>
      <TextInput
        style={s.input}
        value={form.SumClass}
        placeholder="5"
        placeholderTextColor={C.muted}
        keyboardType="number-pad"
        onChangeText={(t) => setForm({ ...form, SumClass: t })}
      />

      <View style={s.formActions}>
        <TouchableOpacity
          style={[s.btnOutline, { flex: 1 }]}
          onPress={closeForm}
        >
          <Text style={s.btnOutlineText}>Hủy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btn, { flex: 2, marginVertical: 0 }]}
          onPress={save}
        >
          <Text style={s.btnText}>
            {editId ? "Lưu thay đổi" : "Thêm giảng viên"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  ) : null;

  // ---------- Màn hình chính ----------
  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.title}>Giảng viên</Text>
            <Text style={s.count}>
              {query
                ? `${filtered.length} / ${list.length} kết quả`
                : `${list.length} giảng viên`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              closeForm();
              setLoggedIn(false);
            }}
          >
            <Text style={s.logout}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>

        <View style={s.toolbar}>
          <View style={s.searchWrap}>
            <TextInput
              style={s.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Tìm theo IDGV hoặc họ tên"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery("")} style={s.clear}>
                <Text style={{ color: C.muted, fontWeight: "700" }}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={s.addBtn} onPress={() => setShowForm(true)}>
            <Text style={s.btnText}>+ Thêm</Text>
          </TouchableOpacity>
          {isWeb && (
            <TouchableOpacity style={s.exportBtn} onPress={exportJson}>
              <Text style={s.exportText}>Xuất JSON</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(u) => u.IDGV}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 60 }}
          ListHeaderComponent={formView}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyTitle}>
                {query ? "Không tìm thấy kết quả" : "Chưa có giảng viên nào"}
              </Text>
              <Text style={s.emptySub}>
                {query
                  ? "Thử từ khóa khác hoặc xóa bộ lọc."
                  : "Bấm “+ Thêm” để tạo giảng viên đầu tiên."}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.row}>
              <TouchableOpacity
                style={s.rowMain}
                onPress={() => setDetail(item)}
              >
                <Avatar user={item} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.name} numberOfLines={1}>
                    {item.Fullname}
                  </Text>
                  <Text style={s.meta} numberOfLines={1}>
                    Mã: {item.IDGV}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={s.badge}>
                <Text style={s.badgeText}>{item.SumClass} lớp</Text>
              </View>
              <TouchableOpacity style={s.chip} onPress={() => edit(item)}>
                <Text style={s.chipText}>Sửa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.chip, s.chipDanger]}
                onPress={() => remove(item)}
              >
                <Text style={[s.chipText, { color: C.danger }]}>Xóa</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>

      <Modal
        visible={!!detail}
        transparent
        animationType="fade"
        onRequestClose={() => setDetail(null)}
      >
        <View style={s.overlay}>
          {detail && (
            <View style={s.sheet}>
              <Avatar user={detail} size={220} radius={24} />
              <Text style={s.detailName}>{detail.Fullname}</Text>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>IDGV</Text>
                <Text style={s.infoValue}>{detail.IDGV}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Tổng số lớp</Text>
                <Text style={s.infoValue}>{detail.SumClass} lớp</Text>
              </View>
              <View style={s.sheetActions}>
                <TouchableOpacity
                  style={[s.chip, s.sheetBtn]}
                  onPress={() => {
                    const u = detail;
                    setDetail(null);
                    edit(u);
                  }}
                >
                  <Text style={s.chipText}>Sửa</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.chip, s.chipDanger, s.sheetBtn]}
                  onPress={() => remove(detail, () => setDetail(null))}
                >
                  <Text style={[s.chipText, { color: C.danger }]}>Xóa</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[s.btn, { alignSelf: "stretch" }]}
                onPress={() => setDetail(null)}
              >
                <Text style={s.btnText}>Đóng</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}
