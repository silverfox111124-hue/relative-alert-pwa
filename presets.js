window.RELATIVE_PRESETS = [
  {
    id: "outing",
    name: "外出",
    alerts: [
      { offsetMinutes: -20, message: "作業終了。今すぐ立つ" },
      { offsetMinutes: -10, message: "玄関へ行く。靴を履く" },
      { offsetMinutes: 0, message: "出発。遅刻ライン" }
    ]
  },
  {
    id: "outing_relaxed",
    name: "余裕あり外出",
    alerts: [
      { offsetMinutes: -60, message: "準備開始。スマホを見るな" },
      { offsetMinutes: -30, message: "作業終了。今すぐ立つ" },
      { offsetMinutes: -15, message: "荷物確認" },
      { offsetMinutes: -5, message: "玄関へ行く。靴を履く" },
      { offsetMinutes: 0, message: "出発。遅刻ライン" }
    ]
  },
  {
    id: "work_start",
    name: "作業開始",
    alerts: [
      { offsetMinutes: -10, message: "作業準備" },
      { offsetMinutes: -5, message: "不要な画面を閉じる" },
      { offsetMinutes: 0, message: "作業開始" }
    ]
  },
  {
    id: "sleep",
    name: "就寝",
    alerts: [
      { offsetMinutes: -60, message: "スマホ終了準備" },
      { offsetMinutes: -30, message: "入浴・片付けを終える" },
      { offsetMinutes: -10, message: "布団に入る" },
      { offsetMinutes: 0, message: "就寝" }
    ]
  }
];
