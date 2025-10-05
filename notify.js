const { Octokit } = require('@octokit/rest');
const fs = require('fs');

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

async function notifyAuthors() {
    const { GITHUB_EVENT_PATH } = process.env;
    const event = JSON.parse(fs.readFileSync(GITHUB_EVENT_PATH, 'utf8'));

    const discussion = event.discussion;
    const comment = event.discussion_comment;

    // 跳过机器人评论
    if (comment.user.type === 'Bot') {
        return;
    }

    // 跳过通知区本身的评论
    if (discussion.id == 2) {
        return;
    }

    // 从讨论标题提取脚本路径
    const scriptPath = extractScriptPath(discussion.title);
    if (!scriptPath) {
        console.log('无法提取脚本路径');
        return;
    }

    // 读取作者映射
    const authorMapping = JSON.parse(fs.readFileSync('author_mapping.json', 'utf8'));
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
    await octokit.rest.discussions.createComment({
        owner: 'zaodonganqi',
        repo: 'bettergi-script-web-giscus',
        discussion_number: 2,  // 直接指定讨论区ID
        body: notificationComment,
    });

    console.log(`已通知作者: ${scriptInfo.authorLinks.join(', ')}`);
}

function extractScriptPath(discussionTitle) {
    // 支持多种标题格式
    const patterns = [
        /- (.+)$/,           // "脚本名 - /path/to/script.js"
        /\[(.+)\]$/,         // "脚本名 [/path/to/script.js]"
        /\((.+)\)$/,         // "脚本名 (/path/to/script.js)"
    ];

    for (const pattern of patterns) {
        const match = discussionTitle.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }

    return null;
}

notifyAuthors().catch(console.error);