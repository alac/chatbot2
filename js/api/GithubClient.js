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
        
        // Identify the first file in the Gist
        const filename = Object.keys(data.files)[0];
        const fileObj = data.files[filename];
        
        // GitHub truncates the 'content' string if the file is larger than 1MB.
        // We must fetch it directly from the raw_url to get the full payload.
        // NOTE: gist.githubusercontent.com rejects CORS preflight requests for Authorization headers.
        // Fortunately, the raw_url includes the commit hash, which acts as an unguessable capability 
        // token, allowing us to fetch secret gists anonymously without the auth header.
        if (fileObj.truncated && fileObj.raw_url) {
            const rawRes = await fetch(fileObj.raw_url); // No headers = no CORS preflight
            if (!rawRes.ok) throw new Error(`GitHub Raw Fetch Error: ${rawRes.status}`);
            return await rawRes.text();
        }
        
        return fileObj.content;
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

    static async updateGist(gistId, filename, content, pat, description = null) {
        const body = { files: { [filename]: { content } } };
        if (description !== null) {
            body.description = description;
        }
        
        const res = await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${pat}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`GitHub API Error: ${res.status}`);
        return await res.json();
    }
}