const { Octokit } = require('@octokit/rest');
const fs = require('fs');

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

async function notifyAuthors() {
    const { GITHUB_EVENT_PATH } = process.env;
    const event = JSON.parse(fs.readFileSync(GITHUB_EVENT_PATH, 'utf8'));

    // console.log('Event data:', JSON.stringify(event, null, 2));

    const discussion = event.discussion;
    const comment = event.comment;

    // 检查必要的数据是否存在
    if (!discussion) {
        console.log('未找到 discussion 数据');
        return;
    }

    if (!comment) {
        console.log('未找到 comment 数据');
        return;
    }

    if (!comment.user) {
        console.log('未找到 comment.user 数据');
        return;
    }

    // 跳过机器人评论
    if (comment.user.type === 'Bot') {
        console.log('跳过机器人评论');
        return;
    }

    // 跳过通知区本身的评论
    if (discussion.id == 2) {
        return;
    }

    // 直接使用讨论标题作为脚本路径
    const scriptPath = discussion.title;
    if (!scriptPath) {
        console.log('未找到讨论标题');
        return;
    }

    // 读取作者映射
    let authorMapping;
    try {
        authorMapping = JSON.parse(fs.readFileSync('author_mapping.json', 'utf8'));
    } catch (error) {
        console.log('读取 author_mapping.json 失败:', error.message);
        return;
    }

    const scriptInfo = authorMapping.find(item => item.path === scriptPath);

    if (!scriptInfo || !scriptInfo.authorLinks.length) {
        console.log(`未找到脚本 ${scriptPath} 的作者信息`);
        return;
    }

    // 构建 @mention 字符串
    const mentions = scriptInfo.authorLinks.map(link => {
        const username = link.split('/').pop();
        return `@${username}`;
    }).join(' ');

    // 构建通知评论
    const notificationComment = `🔔 **脚本评论通知**\n\n${mentions}\n\n📁 **脚本路径：** \`${scriptPath}\`\n💬 **评论内容：**\n${comment.body}\n\n🔗 **讨论链接：** [#${discussion.number}](${discussion.html_url})`;

    // 发送通知
    try {
        await octokit.rest.discussions.createComment({
            owner: 'zaodonganqi',
            repo: 'bettergi-script-web-giscus',
            discussion_number: 2,  // 直接指定讨论区ID
            body: notificationComment,
        });

        console.log(`已通知作者: ${scriptInfo.authorLinks.join(', ')}`);
    } catch (error) {
        console.log('发送通知失败:', error.message);
        if (error.response) {
            console.log('API响应状态:', error.response.status);
            console.log('API响应数据:', error.response.data);
        }
    }
}


notifyAuthors().catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
});