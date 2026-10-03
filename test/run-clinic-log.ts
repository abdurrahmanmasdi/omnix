// I'll just use sed to change `.expect(200)` to `.expect(200).catch(e => console.log(acceptRes.body) || throw e)` or something simpler.
