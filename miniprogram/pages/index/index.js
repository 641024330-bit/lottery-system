const API_BASE = 'https://lottery-system-production-2252.up.railway.app'

Page({
  data: { status: '' },

  onAuth(e) {
    if (!e.detail.userInfo) {
      this.setData({ status: '需要授权才能参与' })
      return
    }

    const { nickName, avatarUrl } = e.detail.userInfo
    this.setData({ status: '正在登录...' })

    wx.login({
      success: (res) => {
        if (!res.code) {
          this.setData({ status: '登录失败，请重试' })
          return
        }

        wx.request({
          url: API_BASE + '/api/miniapp/join',
          method: 'POST',
          data: {
            code: res.code,
            nickname: nickName,
            avatar: avatarUrl
          },
          success: (res) => {
            if (res.data.success) {
              this.setData({ status: '✅ 参与成功！请前往大屏区域就座' })
            } else {
              this.setData({ status: res.data.message || '参与失败' })
            }
          },
          fail: () => {
            this.setData({ status: '网络错误，请稍后重试' })
          }
        })
      },
      fail: () => {
        this.setData({ status: '登录失败，请重试' })
      }
    })
  }
})
