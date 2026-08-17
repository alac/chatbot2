export class GithubClient {
    static async listGists(pat) {
        const res = await fetch('https://api.github.com/gists?per_page=100', {
            headers: { 
                'Authorization': `Bearer ${pat}`, 
                'Accept': 'application/vnd.github.v3+json' 
            }
        });
        if (!res.ok) throw new Error(`GitHub API Error: ${res.status}`);
        return await res.json();
    }

    static async getGist(gistId, pat) {
        const res = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: { 
                'Authorization': `Bearer ${pat}`, 
                'Accept': 'application/vnd.github.v3+json' 
            }
        });
        if (!res.ok) throw new Error(`GitHub API Error: ${res.status}`);
        const data = await res.json();
        // Return the content of the first file in the Gist
        const filename = Object.keys(data.files)[0];
        return data.files[filename].content;
    }

    static async createGist(filename, content, description, pat) {
        const res = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${pat}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                description: description,
                public: false,
                files: { [filename]: { content } }
            })
        });
        if (!res.ok) throw new Error(`GitHub API Error: ${res.status}`);
        return await res.json();
    }

    static async updateGist(gistId, filename, content, pat) {
        const res = await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${pat}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                files: { [filename]: { content } }
            })
        });
        if (!res.ok) throw new Error(`GitHub API Error: ${res.status}`);
        return await res.json();
    }
}