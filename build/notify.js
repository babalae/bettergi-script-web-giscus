const { Octokit } = require('@octokit/core');
const fs = require('fs');

// 检查 GITHUB_TOKEN
if (!process.env.GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN 环境变量未设置');
    process.exit(1);
}

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

// 获取或创建作者的专属讨论区
async function getOrCreateAuthorDiscussion(username) {
    try {
        // 首先尝试查找现有的作者讨论区
        const searchQuery = `
            query SearchDiscussions($searchQuery: String!) {
                search(query: $searchQuery, type: DISCUSSION, first: 10) {
                    nodes {
                        ... on Discussion {
                            id
                            title
                            number
                        }
                    }
                }
            }
        `;

        const searchResponse = await octokit.graphql(searchQuery, {
            searchQuery: `repo:babalae/bettergi-script-web-giscus in:title "作者通知: ${username}"`
        });

        // 如果找到现有的讨论区，返回其ID
        if (searchResponse.search.nodes.length > 0) {
            const existingDiscussion = searchResponse.search.nodes[0];
            console.log(`找到作者 ${username} 的现有讨论区: #${existingDiscussion.number}`);
            return existingDiscussion.id;
        }

        // 如果没有找到，创建新的讨论区
        console.log(`为作者 ${username} 创建新的专属讨论区...`);
        
        const createMutation = `
            mutation CreateDiscussion($input: CreateDiscussionInput!) {
                createDiscussion(input: $input) {
                    discussion {
                        id
                        number
                        url
                    }
                }
            }
        `;

        const createResponse = await octokit.graphql(createMutation, {
            input: {
                repositoryId: "R_kgDOPbW19A", // 仓库的 node_id
                categoryId: "DIC_kwDOPbW19M4Ct_3t", // 讨论分类的 node_id
                title: `作者通知: ${username}`,
                body: `这是作者 @${username} 的专属通知讨论区。\n\n当有用户对该作者的脚本进行评论时，系统会在此讨论区发送通知。\n\n---\n\n*此讨论区由系统自动创建*`
            }
        });

        const newDiscussion = createResponse.createDiscussion.discussion;
        console.log(`为作者 ${username} 创建讨论区成功: #${newDiscussion.number} - ${newDiscussion.url}`);
        
        return newDiscussion.id;
        
    } catch (error) {
        console.log(`获取或创建作者 ${username} 的讨论区失败:`, error.message);
        if (error.errors) {
            console.log('GraphQL错误:', error.errors);
        }
        return null;
    }
}

async function notifyAuthors() {
    const { GITHUB_EVENT_PATH } = process.env;
    const event = JSON.parse(fs.readFileSync(GITHUB_EVENT_PATH, 'utf8'));

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
        authorMapping = JSON.parse(fs.readFileSync('assets/author_mapping.json', 'utf8'));
    } catch (error) {
        console.log('读取 assets/author_mapping.json 失败:', error.message);
        return;
    }

    const scriptInfo = authorMapping.find(item => item.path === scriptPath);

    if (!scriptInfo || !scriptInfo.authorLinks.length) {
        console.log(`未找到脚本 ${scriptPath} 的作者信息`);
        return;
    }

    // 为每个作者单独发送通知
    for (const authorLink of scriptInfo.authorLinks) {
        const username = authorLink.split('/').pop();
        console.log(`正在为作者 ${username} 发送通知...`);
        
        try {
            // 获取或创建作者的专属讨论区
            const authorDiscussionId = await getOrCreateAuthorDiscussion(username);
            
            if (!authorDiscussionId) {
                console.log(`无法为作者 ${username} 创建或获取讨论区`);
                continue;
            }
            
            // 构建单个作者的通知评论
            const safeCommentBody = comment.body.replace(/@(\w+)/g, '@$1');
            const notificationComment = `🔔 **脚本评论通知**\n\n@${username}\n\n📁 **脚本路径：** \n\`${scriptPath}\`\n\n💬 **评论内容：**\n${safeCommentBody}\n\n👤 **评论者：** ${comment.user.login}\n\n🔗 **评论区链接：** [#${discussion.number}](${discussion.html_url})`;
            
            // 发送通知到作者的专属讨论区
            const mutation = `
                mutation AddDiscussionComment($input: AddDiscussionCommentInput!) {
                    addDiscussionComment(input: $input) {
                        comment {
                            id
                            url
                        }
                    }
                }
            `;

            const variables = {
                input: {
                    discussionId: authorDiscussionId,
                    body: notificationComment,
                },
            };

            const response = await octokit.graphql(mutation, variables);
            console.log(`作者 ${username} 的通知发送成功:`, response.addDiscussionComment.comment.url);
            
            // 添加延迟，避免API限制
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.log(`为作者 ${username} 发送通知失败:`, error.message);
            if (error.errors) {
                console.log('GraphQL错误:', error.errors);
            }
        }
    }
}


notifyAuthors().catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
});
