import type { Locale } from "./locale";

/**
 * Chinese copy for messages that services, validation schemas and route
 * handlers produce in English. They stay English inside the server (tests and
 * logs read them); the API boundary localizes them for the requester.
 *
 * Add the Chinese here whenever a service gains a new client-facing message;
 * server-messages.test.ts fails for error messages that are missing.
 */
const exactMessages: Record<string, string> = {
  // Requests, sessions and sign-in
  "Request body is not valid JSON": "请求内容不是有效的 JSON",
  "Check your entries": "请检查填写的内容",
  "Service temporarily unavailable. Try again later": "服务暂时不可用，请稍后重试",
  "Sign in first": "请先登录",
  "Please log in first": "请先登录",
  "Untrusted request origin": "请求来源不受信任",
  "Only administrators can manage accounts": "仅管理员可以管理账号",
  "Enter a valid email address": "请输入有效的邮箱地址",
  "Enter your password": "请输入密码",
  "Too many login attempts. Try again later": "登录尝试次数过多，请稍后再试",
  "Incorrect email or password": "邮箱或密码不正确",
  "Account disabled. Contact the administrator": "账号已停用，请联系管理员",
  "System not initialized. Create an administrator through the web app first":
    "系统尚未初始化，请先在网页端创建管理员",
  "Initialization failed. Try again later": "初始化失败，请稍后再试",

  // Setup and accounts
  "Enter the setup secret": "请输入初始化密钥",
  "Administrator setup secret is not configured on the server":
    "服务器尚未配置管理员初始化密钥",
  "Administrator setup secret file is unavailable": "管理员初始化密钥文件不可用",
  "Administrator setup secret must contain at least 32 characters":
    "管理员初始化密钥至少需要 32 个字符",
  "System already initialized": "系统已完成初始化",
  "Incorrect setup secret": "初始化密钥不正确",
  "Invalid initial user email": "初始用户的邮箱格式无效",
  "Initial password must contain at least 12 characters": "初始密码至少需要 12 个字符",
  "Users already exist in the database; refusing to overwrite":
    "数据库中已有用户，不会覆盖",
  "Enter a nickname": "请输入昵称",
  "Nickname must not exceed 40 characters": "昵称不能超过 40 个字符",
  "Nickname supports up to 40 characters": "昵称最多 40 个字符",
  "Password must contain at least 12 characters": "密码至少需要 12 个字符",
  "Password must not exceed 200 characters": "密码不能超过 200 个字符",
  "Enter the current administrator password": "请输入管理员当前密码",
  "This email is already in use": "该邮箱已被使用",
  "Too many verification attempts. Try again later": "验证尝试次数过多，请稍后再试",
  "Incorrect current administrator password": "管理员当前密码不正确",
  "Account not found": "账号不存在",
  "The sole administrator cannot be disabled": "不能停用唯一的管理员",
  "Change at least one profile field": "请至少修改一项资料",

  // Files
  "File not found": "文件不存在",
  "File ID has an invalid format": "文件 ID 格式不正确",
  "Upload request exceeds 10 MiB limit": "上传请求超过 10 MiB 限制",
  "Choose a statement file": "请选择账单文件",
  "Use the image upload form": "请使用图片上传表单",
  "A screenshot upload request must not exceed 41 MiB": "单次截图上传请求不能超过 41 MiB",
  "Invalid upload form": "上传表单无效",
  "Select at least one screenshot": "请至少选择一张截图",
  "Quick screenshot entry supports one image at a time": "快捷截图记账每次只能处理一张图片",
  "Only supports CSV and XLSX File": "仅支持 CSV 和 XLSX 文件",
  "Statement file must be smaller than 10 MiB": "账单文件必须小于 10 MiB",
  "Declared file type does not match the extension": "文件声明的类型与扩展名不符",
  "File content is not valid XLSX": "文件内容不是有效的 XLSX",
  "CSV contains unsupported binary content": "CSV 中包含不支持的二进制内容",
  "Only JPG, PNG, and WebP images are supported": "仅支持 JPG、PNG 和 WebP 图片",
  "Each image must be smaller than 8 MiB": "每张图片必须小于 8 MiB",
  "Declared image type does not match the extension": "图片声明的类型与扩展名不符",
  "Image content does not match its file type": "图片内容与文件类型不符",
  "Choose screenshots": "请选择截图",
  "Unsafe file path": "文件路径不安全",
  "File content has been deleted": "文件内容已被删除",
  "Failed to delete file. Try again later": "文件删除失败，请稍后重试",
  "Original file content deleted. Existing transactions and import records remain; source links show that the original is unavailable.":
    "原始文件内容已删除。已有交易和导入记录会保留，来源链接将显示原文件不可用。",

  // Amounts, currencies and times
  "Invalid amount format": "金额格式不正确",
  "Invalid currency format": "币种格式不正确",
  "Only currencies with two decimal places are supported": "仅支持两位小数的币种",
  "Amount exceeds the supported range": "金额超出支持范围",
  "Minor currency units must be a nonnegative safe integer": "最小货币单位必须是非负安全整数",
  "Invalid transaction time format": "交易时间格式不正确",
  "Enter an amount": "请输入金额",
  "Amount is too long": "金额过长",
  "Currency must be a three-letter code": "币种必须是三位字母代码",
  "Currency must be three uppercase letters": "币种应为三个大写字母",
  "End date must not precede start date": "结束日期不能早于开始日期",
  "Cannot combine uncategorized with a specific category": "不能同时筛选未分类和具体分类",

  // Ledger: posting, amending and voiding transactions
  "Transaction not found": "交易不存在",
  "Transaction revision not found": "交易版本不存在",
  "Transaction already voided": "交易已作废",
  "Voided transactions cannot be amended": "已作废的交易不能修改",
  "Amended transaction requires duplicate review": "修改后的交易需要核对是否重复",
  "Remembering a category requires a nonempty merchant and category":
    "记住分类需要填写商户和分类",
  "Confirmation completed, but the transaction was not found": "已确认，但未找到对应的交易",
  "This amendment identity is bound to a different command": "该修改操作的标识已用于其他请求",
  "This confirmation identity is bound to different candidates or decisions":
    "该确认操作的标识已用于其他候选或决定",
  "This void identity is bound to a different command": "该作废操作的标识已用于其他请求",
  "A void command cannot contain the same transaction twice": "一次作废中不能重复包含同一笔交易",
  "Void operation record is incomplete": "作废操作记录不完整",
  "Selected category is missing or incompatible with this transaction type":
    "所选分类不存在或不适用于该交易类型",
  "Import source reference is missing, expired, or belongs to another user":
    "导入来源不存在、已失效或属于其他用户",
  "Import item canonical ledger fields are stale": "导入记录的账本字段已过期",
  "Import item changed before final confirmation": "导入记录在最终确认前已变化",
  "Notification candidate is missing, expired, or belongs to another user":
    "通知候选不存在、已失效或属于其他用户",
  "Notification candidate canonical ledger fields are stale": "通知候选的账本字段已过期",
  "Notification candidate changed before final confirmation": "通知候选在最终确认前已变化",
  "Screenshot source reference is missing, expired, or belongs to another user":
    "截图来源不存在、已失效或属于其他用户",
  "Screenshot item canonical ledger fields are stale": "截图记录的账本字段已过期",
  "Screenshot item changed before final confirmation": "截图记录在最终确认前已变化",

  // Duplicate detection reasons (import warnings, capture warnings)
  "Platform transaction ID is already linked as supplemental bill evidence":
    "平台交易号已作为账单补充凭证关联",
  "Platform transaction ID is linked to a transaction from another source":
    "平台交易号已关联到其他来源的交易",
  "Identical platform transaction ID": "平台交易号完全相同",
  "Same platform transaction ID from different import sources":
    "平台交易号相同，但来自不同的导入来源",
  "Identical source, amount, merchant, and time": "来源、金额、商户和时间完全相同",
  "Same amount and merchant; transaction times differ by at most 5 minutes":
    "金额和商户相同，交易时间相差不超过 5 分钟",
  "Same amount within 30 seconds; merchant or payment channel differs or is missing":
    "30 秒内金额相同，但商户或支付渠道不同或缺失",
  "A bank debit and payment-app transaction have the same amount within 5 minutes; merchant labels may differ":
    "银行扣款与支付 App 交易在 5 分钟内金额相同，商户名称可能不同",
  "Final review found possible duplicates": "最终核对发现疑似重复",

  // Categories and merchant rules
  "Category not found": "分类不存在",
  "Uncategorized": "未分类",
  "Built-in category names cannot be edited; they switch between English and Chinese on the Categories page. Icons and colors are editable":
    "内置分类名称不能手动修改，可在分类页切换中英文；图标和颜色可以调整",
  "Built-in category types cannot be changed. Icons and colors are editable":
    "内置分类的类型不能修改；图标和颜色可以调整",
  "Built-in categories support automatic categorization. Edit icons and colors, but do not delete them":
    "内置分类用于自动分类，可以调整图标和颜色，但不能删除",
  "The order no longer matches current categories. Refresh and try again":
    "排序与当前分类不一致，请刷新后重试",
  "Merchant learning rule not found": "商户学习规则不存在",
  "Enter a category name": "请输入分类名称",
  "Category names support up to 24 characters": "分类名称最多 24 个字符",
  "Choose a valid Lucide icon": "请选择有效的 Lucide 图标",
  "Color must be a 6 digit hex value": "颜色必须是 6 位十六进制色值",
  "Category ID has an invalid format": "分类 ID 格式不正确",
  "Submit at least one field to change": "请至少提交一个要修改的字段",
  "Category order cannot contain duplicates": "分类排序不能包含重复项",
  "Rule ID has an invalid format": "规则 ID 格式不正确",

  // Statement import
  "Import batch not found": "导入批次不存在",
  "Import batch is no longer editable": "导入批次已不可编辑",
  "Import batch changed. Review again": "导入批次已变化，请重新核对",
  "Import batch status changed. Refresh and try again": "导入批次状态已变化，请刷新后重试",
  "Import record not found": "导入记录不存在",
  "This batch cannot be confirmed": "该批次不能确认",
  "Staged data is corrupted": "暂存数据已损坏",
  "Confirmation result is missing an import item": "确认结果缺少导入记录",
  "Selected category does not exist": "所选分类不存在",
  "Selected category does not support this transaction type": "所选分类不适用于该交易类型",
  "Cannot determine transaction type": "无法判断交易类型",
  "Amount is missing or invalid": "金额缺失或格式不正确",
  "Transaction time is missing or invalid": "交易时间缺失或格式不正确",
  "Merchant name is empty. Consider adding it before import": "商户名称为空，建议导入前补充",
  "Identical to an earlier record in this batch": "与本批次前面的记录完全相同",
  "Some possible duplicates still need a decision": "仍有疑似重复的记录需要处理",
  "Invalid records still need correction": "仍有无效记录需要修正",
  "Correct invalid fields first": "请先修正有误的字段",
  "Final review found new possible duplicates. Choose an action again":
    "最终核对发现新的疑似重复，请重新选择处理方式",
  "Bill enrichment conflicts still need individual decisions": "仍有账单补全冲突需要逐项选择",
  "Choose the current or statement value for each field first":
    "请先为每个字段选择保留当前值或采用账单值",
  "This record has no actionable enrichment conflict": "该记录没有需要处理的补全冲突",
  "Notification candidate duplicate status changed. Review again":
    "通知候选的重复状态已变化，请重新核对",
  "Transaction to enrich changed. Review again": "待补全的交易已变化，请重新核对",
  "Revision or duplicate status of the transaction to enrich changed. Review again":
    "待补全交易的版本或重复状态已变化，请重新核对",
  "Multiple notification targets share the amount and time window; automatic enrichment is unavailable":
    "同一金额和时间段内有多条通知记录，无法自动补全",
  "Multiple statement rows match the same notification target; automatic enrichment is unavailable":
    "多条账单记录匹配同一条通知记录，无法自动补全",
  "No importable data rows found": "没有找到可导入的数据行",
  "Maximum rows per import: 10,000 rows": "单次最多导入 10,000 行",
  "Cannot detect headers. Check that the file contains transaction details":
    "无法识别表头，请检查文件是否包含交易明细",
  "Field mapping cannot be changed for this batch": "该批次不能修改字段映射",
  "Field mapping contains unknown headers": "字段映射包含未知表头",
  "Unsupported file format": "不支持的文件格式",
  "Cannot recognize CSV encoding. Use UTF-8 or GB18030": "无法识别 CSV 编码，请使用 UTF-8 或 GB18030",
  "XLSX Incomplete ZIP directory": "XLSX 压缩目录不完整",
  "Currently unsupported: ZIP64 workbook": "暂不支持 ZIP64 工作簿",
  "XLSX Too many file entries": "XLSX 文件条目过多",
  "XLSX Uncompressed content exceeds the safety limit": "XLSX 解压后的内容超过安全限制",
  "XLSX File is corrupted or its format is unsupported": "XLSX 文件已损坏或格式不受支持",
  "No readable worksheets in the workbook": "工作簿中没有可读取的工作表",
  "Worksheet dimensions exceed the safety limit": "工作表行列范围超过安全限制",
  "This transaction has no adoptable AI category suggestion": "这笔交易没有可采用的 AI 分类建议",
  "Transaction changed. Request a new AI category suggestion": "交易内容已变化，请重新获取 AI 分类建议",
  "Missing Other category; cannot invalidate old AI suggestions":
    "缺少「Other」分类，无法让旧的 AI 建议失效",

  // Screenshot recognition
  "Recognition task not found": "识别任务不存在",
  "Recognition task status changed": "识别任务状态已变化",
  "Recognition task failed. Try again later": "识别任务失败，请稍后重试",
  "This recognition task cannot be edited": "该识别任务不能编辑",
  "This recognition task cannot be confirmed": "该识别任务不能确认",
  "Recognition item not found": "识别记录不存在",
  "Recognition item is stale. Save it again before confirming": "识别记录已过期，请重新保存后再确认",
  "Confirm transaction type": "请确认交易类型",
  "Enter a valid amount": "请填写有效金额",
  "Enter a transaction time": "请填写交易时间",
  "Confirm currency": "请确认币种",
  "Complete and save required fields first": "请先补全并保存必填字段",
  "Some screenshots still need fields completed or duplicate decisions":
    "仍有截图需要补全字段或处理重复",
  "New possible duplicates found before confirmation. Choose how to handle them again":
    "确认前发现新的疑似重复，请重新选择处理方式",
  "Only possible duplicates can be marked to import anyway": "只有疑似重复的记录才能选择仍然导入",
  "Identical transaction to another screenshot in this batch": "与本批次另一张截图的交易完全相同",
  "Similar amount, merchant, and time to another screenshot in this batch":
    "与本批次另一张截图的金额、商户和时间相近",
  "Identical transaction to an earlier screenshot in this batch": "与本批次前面截图中的交易完全相同",
  "Identical to an earlier original screenshot in this batch": "与本批次前面的原始截图完全相同",
  "Upload up to 10 screenshots": "每次最多上传 10 张截图",
  "Total screenshot size must not exceed 40 MiB": "截图总大小不能超过 40 MiB",
  "Agree to send screenshots to the configured recognition service first":
    "请先同意将截图发送给已配置的识别服务",
  "Invalid submission identity": "提交标识无效",
  "This submission belongs to different screenshots": "该提交标识已用于其他截图",
  "Recognition unavailable. Complete fields using the original image": "识别不可用，请对照原图填写字段",
  "Recognition service temporarily unavailable": "识别服务暂时不可用",
  "Currently in Mock recognition mode does not read image content. Enter and confirm fields manually.":
    "当前为 Mock 识别模式，不会读取图片内容，请手动填写并确认字段。",
  "Recognition image is empty": "识别图片为空",
  "Recognition image must be smaller than 8 MiB": "识别图片必须小于 8 MiB",
  "Invalid recognition image type or filename": "识别图片的类型或文件名无效",
  "Recognition service API Key configuration is incomplete": "识别服务的 API Key 配置不完整",
  "Recognition service endpoint Only supports HTTP or HTTPS": "识别服务地址仅支持 HTTP 或 HTTPS",
  "Recognition service endpoint is not valid URL": "识别服务地址不是有效的 URL",
  "Recognition service endpoint must use HTTPS": "识别服务地址必须使用 HTTPS",
  "RECEIPT_RECOGNITION_HTTP_TIMEOUT_MS must be an integer":
    "RECEIPT_RECOGNITION_HTTP_TIMEOUT_MS 必须是整数",
  "Screenshot recognition is temporarily unavailable. Retry later or complete manually":
    "截图识别暂时不可用，请稍后重试或手动填写",
  "Screenshot recognition response is too large. Complete manually": "截图识别返回的内容过大，请手动填写",
  "Screenshot recognition result has an invalid format. Complete manually":
    "截图识别结果格式不正确，请手动填写",
  "Screenshot recognition service did not return JSON content. Complete manually":
    "截图识别服务没有返回 JSON 内容，请手动填写",
  "Screenshot recognition service did not return valid JSON. Complete the fields manually":
    "截图识别服务没有返回有效的 JSON，请手动填写字段",
  "Screenshot recognition service returned an error. Retry later or complete manually":
    "截图识别服务返回错误，请稍后重试或手动填写",
  "Screenshot recognition timed out. Retry later or complete manually":
    "截图识别超时，请稍后重试或手动填写",
  "The current runtime has no available fetch": "当前运行环境没有可用的 fetch",

  // Screenshot recognition provider metadata (label / providerLabel, disclosure, retentionPolicy)
  "Mock Local demo": "Mock 本地演示",
  "Recognition service is currently unavailable": "识别服务当前不可用",
  "Configured third-party recognition service": "已配置的第三方识别服务",
  "Configured external HTTP JSON Recognition service": "已配置的外部 HTTP JSON 识别服务",
  "Screenshot recognition configuration unavailable": "截图识别配置不可用",
  "Original screenshots are sent to the configured recognition service solely to extract transaction fields.":
    "原始截图会发送给已配置的识别服务，仅用于提取交易字段。",
  "Original screenshots are sent to the third-party service configured by the deployer, solely to extract transaction fields.":
    "原始截图会发送给部署者配置的第三方服务，仅用于提取交易字段。",
  "No images are sent externally. Use retained originals to fill in fields after upload.":
    "不会向外部发送图片。上传后可对照保留的原图填写字段。",
  "Screenshots are not sent externally. Complete missing fields using the original image.":
    "截图不会发送到外部。请对照原图补全缺失的字段。",
  "Screenshots are not sent externally;Mock leaves transaction facts blank for manual confirmation against the original image.":
    "截图不会发送到外部；Mock 模式不填写交易信息，需要对照原图手动确认。",
  "The current configuration does not trigger external recognition. Uploaded originals remain available for manual entry.":
    "当前配置不会触发外部识别，上传的原图仍可用于手动填写。",
  "Third-party retention depends on the agreement between the deployer and provider.":
    "第三方是否留存取决于部署者与服务商的协议。",
  "Third-party retention depends on the provider agreement. Check before uploading.":
    "第三方是否留存取决于与服务商的协议，请在上传前确认。",
  "No third-party service is called and no third-party copy is created.":
    "不会调用第三方服务，也不会产生第三方副本。",
  "Mock No third-party copies are created.": "Mock 模式不会产生第三方副本。",

  // Notification capture
  "Notification candidate not found": "通知候选不存在",
  "Notification candidate fields are stale. Edit again": "通知候选的字段已过期，请重新编辑",
  "Notification candidate changed. Review the statement again": "通知候选已变化，请重新核对账单",
  "Confirmation completed, but the notification candidate result was not found":
    "已确认，但未找到通知候选的结果",
  "Completed notification candidates cannot be edited": "已完成的通知候选不能再编辑",
  "Enter a merchant before posting": "请先填写商户再入账",
  "A selected candidate changed or needs duplicate review. Nothing in this batch was posted":
    "有候选已变化或需要核对重复，本批均未入账",
  "A selected candidate now needs duplicate review. Nothing in this batch was posted":
    "有候选需要核对重复，本批均未入账",
  "Select each candidate once": "每个候选只能选择一次",
  "Change at least one setting": "请至少修改一项设置",

  // AI categorization
  "AI categorization is disabled": "AI 分类未启用",
  "Current AI categorization is disabled": "当前未启用 AI 分类",
  "Enable AI categorization before testing the connection": "请先启用 AI 分类再测试连接",
  "AI categorization configuration is unavailable": "AI 分类配置不可用",
  "Personal AI categorization configuration is unavailable": "个人 AI 分类配置不可用",
  "Enter OpenAI compatible service URL": "请输入 OpenAI 兼容服务地址",
  "Enter a model name": "请输入模型名称",
  "AI Category API Key has an invalid format": "AI 分类 API Key 格式不正确",
  "AI categorization URL must not contain credentials": "AI 分类服务地址不能包含账号或密码",
  "AI categorization model name is missing or invalid": "AI 分类模型名称缺失或格式不正确",
  "AI categorization response has an invalid structure": "AI 分类返回的结构不正确",
  "AI categorization response is too large": "AI 分类返回的内容过大",
  "AI categorization service Base URL has an invalid format": "AI 分类服务 Base URL 格式不正确",
  "AI categorization service did not return JSON content": "AI 分类服务没有返回 JSON 内容",
  "AI categorization service did not return valid JSON": "AI 分类服务没有返回有效的 JSON",
  "AI categorization service only supports HTTP or HTTPS": "AI 分类服务仅支持 HTTP 或 HTTPS",
  "AI categorization service refused this batch": "AI 分类服务拒绝处理这批数据",
  "AI categorization service temporarily unavailable": "AI 分类服务暂时不可用",
  "AI categorization service timed out": "AI 分类服务响应超时",
  "Cannot connect to AI categorization service": "无法连接 AI 分类服务",
  "HTTP AI categorization service requires explicit permission for insecure connections":
    "使用 HTTP 的 AI 分类服务需要显式允许不安全连接",
  "Public AI categorization service requires API Key": "公网 AI 分类服务必须配置 API Key",
  "Saved AI API Key cannot be decrypted. Restore the encryption key or reconfigure":
    "已保存的 AI API Key 无法解密，请恢复加密密钥或重新配置",
  "AI_CATEGORIZATION_AUTO_THRESHOLD must be 0 to 1 within the numeric range":
    "AI_CATEGORIZATION_AUTO_THRESHOLD 必须是 0 到 1 之间的数字",
  "AI_CATEGORIZATION_RESPONSE_MODE only supports json_schema or json_object":
    "AI_CATEGORIZATION_RESPONSE_MODE 只支持 json_schema 或 json_object",

  // AI categorization provider metadata (providerLabel, disclosure, retentionPolicy)
  "OpenAI compatible external categorization service": "OpenAI 兼容的外部分类服务",
  "Local OpenAI compatible categorization service": "本机 OpenAI 兼容分类服务",
  "Only merchant learning rules and local keywords are used. No transaction text is sent.":
    "仅使用商户学习规则和本地关键词，不会发送交易文本。",
  "No transaction text is sent. Categorization falls back to local rules.":
    "不会发送交易文本，分类将改用本地规则。",
  "Categorization sends transaction type, source, merchant, cleaned description, and category names. Order IDs, user identifiers, and original files are excluded. When a phone has item recognition switched on, the text of the order pages shown before a shopping-app payment is sent too, after phone numbers, address lines, links and long numbers are removed.":
    "分类时会发送交易类型、来源、商户、清理后的描述和分类名称，不会发送订单号、用户标识或原始文件。手机开启“识别所购商品”后，购物应用付款前下单页上的文字也会发送，发送前会去掉手机号、地址行、链接和长数字。",
  "Categorization data is sent only to a local loopback address and never leaves this device.":
    "分类数据只发送到本机回环地址，不会离开这台设备。",
  "No calls to AI services; no server-side copies are created.":
    "不会调用 AI 服务，也不会产生服务端副本。",
  "Provider retention and duration depend on the agreement between the deployer and provider.":
    "服务商是否留存、留存多久，取决于部署者与服务商的协议。",
  "The app does not retain complete prompts or raw model responses.":
    "应用不会保存完整的提示词或模型原始响应。",

  // Statistics
  "Month format must be YYYY-MM": "月份格式应为 YYYY-MM",
  "Invalid user time zone": "用户时区无效",
  "Cannot calculate the current month": "无法计算当前月份",

  // zod's default messages without parameters
  "Invalid input": "输入无效",
};

type Render = (...groups: string[]) => string;

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** zod type names in "expected string, received undefined". */
const zodTypeNames: Record<string, string> = {
  string: "文本",
  number: "数字",
  int: "整数",
  bigint: "整数",
  boolean: "布尔值",
  object: "对象",
  array: "数组",
  date: "日期",
  file: "文件",
  null: "空值",
  undefined: "空值",
  nan: "NaN",
  NaN: "NaN",
  record: "对象",
  map: "映射",
  set: "集合",
};

const zodUnits: Record<string, string> = {
  characters: "个字符",
  items: "项",
  entries: "项",
  bytes: "字节",
};

const zodFormats: Record<string, string> = {
  "email address": "邮箱地址",
  URL: "URL",
  UUID: "UUID",
  GUID: "GUID",
  "ISO datetime": "日期时间",
  "ISO date": "日期",
  "ISO time": "时间",
  "ISO duration": "时长",
  "IPv4 address": "IPv4 地址",
  "IPv6 address": "IPv6 地址",
  "base64-encoded string": "Base64 文本",
  "JSON string": "JSON 文本",
  input: "输入",
};

/** Messages with interpolated values. Captured groups are reused in order. */
const patternMessages: Array<[RegExp, Render]> = [
  // Configuration (environment variable names stay as they are)
  [
    /^([A-Z][A-Z0-9_]*) must be (-?\d+) to (-?\d+) within the integer range$/,
    (key, min, max) => `${key} 必须是 ${min} 到 ${max} 之间的整数`,
  ],
  [/^([A-Z][A-Z0-9_]*) must be true or false$/, (key) => `${key} 必须是 true 或 false`],
  [
    /^OpenAI compatible categorization requires ([A-Z][A-Z0-9_]*)$/,
    (key) => `OpenAI 兼容分类缺少 ${key} 配置`,
  ],
  [/^HTTP recognition mode requires ([A-Z][A-Z0-9_]*)$/, (key) => `HTTP 识别模式缺少 ${key} 配置`],
  [
    /^Configure a valid ([A-Z][A-Z0-9_]*) before saving API Key$/,
    (key) => `请先配置有效的 ${key}，再保存 API Key`,
  ],
  [/^Unsupported AI categorization provider: (.*)$/, (mode) => `不支持的 AI 分类服务：${mode}`],
  [/^Unsupported screenshot recognition provider: (.*)$/, (mode) => `不支持的截图识别服务：${mode}`],
  [
    /^AI categorization timeout must be an integer between (\d+) to (\d+) milliseconds$/,
    (min, max) => `AI 分类超时时间必须是 ${min} 到 ${max} 毫秒之间的整数`,
  ],
  [
    /^Recognition timeout must be an integer between (\d+) to (\d+) milliseconds$/,
    (min, max) => `识别超时时间必须是 ${min} 到 ${max} 毫秒之间的整数`,
  ],

  // Categories
  [/^Category “(.+)” already exists$/, (name) => `分类「${name}」已存在`],
  [/^Each account supports up to (\d+) categories$/, (count) => `每个账号最多创建 ${count} 个分类`],
  [
    /^There are still (\d+) transactions use this category\. Move or uncategorize them first$/,
    (count) => `仍有 ${count} 笔交易使用该分类，请先把它们移到其他分类或取消分类`,
  ],
  [
    /^This category is still used by (\d+) transactions and (\d+) learning rules; its type cannot be changed$/,
    (transactions, rules) =>
      `该分类仍被 ${transactions} 笔交易和 ${rules} 条学习规则使用，不能修改类型`,
  ],

  // Statement import
  [/^CSV Page (\d+) row format is invalid$/, (row) => `CSV 第 ${row} 行格式不正确`],
  [/^Maximum rows per import: ([\d,]+) rows$/, (count) => `单次最多导入 ${count} 行`],
  [/^“(.+)” is excluded from import by default$/, (status) => `「${status}」默认不导入`],
  [
    /^May match batch row (\d+) as the same transaction$/,
    (row) => `可能与本批次第 ${row} 行是同一笔交易`,
  ],
  [/^Unnamed column_(\d+)$/, (index) => `未命名列_${index}`],
  [
    // "Row 3: msg, msg; Row 5: msg; Also 2 rows. Correct it manually or skip"
    /^(Row \d+: .+?)(?:; Also (\d+) rows)?\. Correct it manually or skip$/,
    (rows, remaining) => {
      const localizedRows = rows
        .split("; ")
        .map((row) => {
          const match = /^Row (\d+): (.*)$/.exec(row);
          return match
            ? `第 ${match[1]} 行：${translateJoined(match[2]!, ", ", "，")}`
            : row;
        })
        .join("；");
      return `${localizedRows}${remaining ? `；另有 ${remaining} 行` : ""}。请手动修正或选择跳过`;
    },
  ],

  // Screenshot recognition warnings
  [
    /^Recognition incomplete \((Service configuration error|Service temporarily unavailable)\)\. The original image has been retained\.$/,
    (reason) =>
      `识别未完成（${reason === "Service configuration error" ? "服务配置错误" : "服务暂时不可用"}），原图已保留。`,
  ],

  // Statistics month labels ("November 2026")
  [
    new RegExp(`^(${months.join("|")}) (\\d{4})$`),
    (month, year) => `${year}年${months.indexOf(month!) + 1}月`,
  ],

  // zod's default messages (schemas without a custom message)
  [
    /^Invalid input: expected (\w+), received (\w+)$/,
    (expected, received) =>
      received === "undefined"
        ? "缺少必填内容"
        : `类型不正确：应为${zodTypeNames[expected!] ?? expected}，实际为${zodTypeNames[received!] ?? received}`,
  ],
  [/^Invalid input: expected (.+)$/, (value) => `输入无效：应为 ${value}`],
  [/^Invalid option: expected one of (.+)$/, (values) => `选项无效：应为 ${values} 之一`],
  [
    /^Too big: expected \w+ to have (<=|<)(\d+) (characters|items|entries|bytes)$/,
    (operator, limit, unit) =>
      operator === "<="
        ? `最多 ${limit} ${zodUnits[unit!]}`
        : `必须少于 ${limit} ${zodUnits[unit!]}`,
  ],
  [
    /^Too small: expected \w+ to have (>=|>)(\d+) (characters|items|entries|bytes)$/,
    (operator, limit, unit) =>
      operator === ">=" && limit === "1"
        ? unit === "characters"
          ? "不能为空"
          : "至少需要 1 项"
        : operator === ">="
          ? `至少需要 ${limit} ${zodUnits[unit!]}`
          : `必须多于 ${limit} ${zodUnits[unit!]}`,
  ],
  [
    /^Too big: expected \w+ to be (<=|<)(.+)$/,
    (operator, limit) => (operator === "<=" ? `不能大于 ${limit}` : `必须小于 ${limit}`),
  ],
  [
    /^Too small: expected \w+ to be (>=|>)(.+)$/,
    (operator, limit) => (operator === ">=" ? `不能小于 ${limit}` : `必须大于 ${limit}`),
  ],
  [/^Invalid string: must start with "(.*)"$/, (prefix) => `必须以「${prefix}」开头`],
  [/^Invalid string: must end with "(.*)"$/, (suffix) => `必须以「${suffix}」结尾`],
  [/^Invalid string: must include "(.*)"$/, (text) => `必须包含「${text}」`],
  [/^Invalid string: must match pattern .+$/, () => "格式不正确"],
  [/^Invalid number: must be a multiple of (.+)$/, (divisor) => `必须是 ${divisor} 的倍数`],
  [/^Unrecognized keys?: (.+)$/, (keys) => `包含无法识别的字段：${keys}`],
  [/^Invalid discriminator value\. Expected (.+)$/, (options) => `类型无效：应为 ${options}`],
  [/^Invalid key in \w+$/, () => "键无效"],
  [/^Invalid value in \w+$/, () => "值无效"],
  [
    new RegExp(`^Invalid (${Object.keys(zodFormats).join("|")})$`),
    (format) => `${zodFormats[format!]}格式不正确`,
  ],
];

function translate(message: string): string | undefined {
  const exact = exactMessages[message];
  if (exact !== undefined) return exact;
  for (const [pattern, render] of patternMessages) {
    const match = pattern.exec(message);
    if (match) return render(...match.slice(1));
  }
  return undefined;
}

/**
 * Translates a list of messages joined with `separator`. Messages may contain
 * the separator themselves, so the longest known run of parts wins.
 */
function translateJoined(text: string, separator: string, zhSeparator: string) {
  const parts = text.split(separator);
  const translated: string[] = [];
  let start = 0;
  while (start < parts.length) {
    let end = parts.length;
    let match: string | undefined;
    for (; end > start; end -= 1) {
      match = translate(parts.slice(start, end).join(separator));
      if (match !== undefined) break;
    }
    if (match === undefined) {
      translated.push(parts[start]!);
      start += 1;
    } else {
      translated.push(match);
      start = end;
    }
  }
  return translated.join(zhSeparator);
}

export function localizeServerMessage(message: string, locale: Locale): string {
  if (locale !== "zh") return message;
  return translate(message) ?? message;
}

export function localizeFieldErrors(
  fieldErrors: Record<string, string[] | undefined>,
  locale: Locale,
): Record<string, string[] | undefined> {
  if (locale !== "zh") return fieldErrors;
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([field, messages]) => [
      field,
      messages?.map((message) => localizeServerMessage(message, locale)),
    ]),
  );
}

/** Keys whose string value is server-authored copy that clients show verbatim. */
const serverTextKeys = new Set([
  "message",
  "errorMessage",
  "label",
  "providerLabel",
  "disclosure",
  "retentionPolicy",
  "referencePolicy",
]);
/** Keys holding a list of server-authored strings (or of objects with `message`). */
const serverTextListKeys = new Set(["warnings"]);
/** User data that must never be rewritten, even if it happens to match. */
const userDataKeys = new Set(["rawData"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function localizeDataValue(value: unknown, key: string | null): unknown {
  if (typeof value === "string") {
    return key !== null && serverTextKeys.has(key) ? (translate(value) ?? value) : value;
  }
  if (Array.isArray(value)) {
    const listOfText = key !== null && serverTextListKeys.has(key);
    return value.map((item) =>
      listOfText && typeof item === "string"
        ? (translate(item) ?? item)
        : localizeDataValue(item, null),
    );
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        userDataKeys.has(childKey) ? child : localizeDataValue(child, childKey),
      ]),
    );
  }
  return value;
}

/**
 * Localizes server-authored copy inside API data: `message` / `errorMessage`
 * fields (validation issues, import row errors and warnings), string entries
 * of `warnings` lists, and provider metadata (`label`, `providerLabel`,
 * `disclosure`, `retentionPolicy`, `referencePolicy`). Only strings found in
 * the dictionary change, so user data passes through untouched.
 */
export function localizeServerData<T>(data: T, locale: Locale): T {
  if (locale !== "zh") return data;
  return localizeDataValue(data, null) as T;
}
