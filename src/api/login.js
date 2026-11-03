import request from '@/utils/request'

// 登录方法
export function login(username, password, code, uuid) {
  const data = {
    username,
    password,
    code,
    uuid
  }
  return request({
    url: '/login',
    headers: {
      isToken: false,
      repeatSubmit: false
    },
    method: 'post',
    data: data
  })
}

// 注册方法
export function register(data) {
  return request({
    url: '/register',
    headers: {
      isToken: false
    },
    method: 'post',
    data: data
  })
}

// 获取用户详细信息
export function getInfo() {
  return request({
    url: '/getInfo',
    method: 'get'
  })
}

// 解锁屏幕
export function unlockScreen(password) {
  return request({
    url: '/unlockscreen',
    method: 'post',
    data: { password }
  })
}

// 退出方法
export function logout() {
  return request({
    url: '/logout',
    method: 'post'
  })
}

// 获取验证码（旧的字符/算术验证码，备用）
export function getCodeImg() {
  return request({
    url: '/captchaImage',
    headers: {
      isToken: false
    },
    method: 'get',
    timeout: 20000
  })
}

// 获取滑块拼图验证码
export function getSliderCaptcha() {
  return request({
    url: '/captchaSlider',
    headers: {
      isToken: false
    },
    method: 'get',
    timeout: 20000
  })
}

// 校验滑块位置，通过后返回一次性凭证（登录时当作 code 提交）
export function verifySliderCaptcha(data) {
  return request({
    url: '/captchaSliderVerify',
    headers: {
      isToken: false
    },
    method: 'post',
    data
  })
}