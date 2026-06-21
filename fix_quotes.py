with open('C:/Users/manju/Projects/Experiments/nodeserver/static/autoTrade/grootTradeBot.js','r',encoding='utf-8') as f:
    d=f.read()

lines=d.split('\n')
out=[]
bs='\\'
for line in lines:
    result=[]
    i=0
    n=len(line)
    while i<n:
        ch=line[i]
        if ch=="'":
            j=i+1
            while j<n:
                prev=line[j-1] if j>0 else ''
                if line[j]=="'" and prev!=bs:
                    break
                j+=1
            if j<n:
                inner=line[i+1:j]
                if "'" in inner:
                    inner=inner.replace("'","&#39;")
                result.append("'" + inner + "'")
                i=j+1
            else:
                result.append(ch)
                i+=1
        else:
            result.append(ch)
            i+=1
    out.append(''.join(result))

with open('C:/Users/manju/Projects/Experiments/nodeserver/static/autoTrade/grootTradeBot.js','w',encoding='utf-8') as f:
    f.write('\n'.join(out))
print('done')
