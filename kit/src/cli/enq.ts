import { Command } from 'commander'
import fs from 'fs'

const main = async () => {
    const program = new Command()
        .arguments("[input]")

    // const addCommand = new Command('add')
    // program.addCommand(addCommand)
    program.parse(process.argv)


    if (program.args.length === 0) {
        return
    }

    console.log(program.args)
    const [input] = program.args
    if (input === 'add') {
        //todo add item
        // // const exampleLink = terminalLink('here', 'https://google.com')
        // console.log(`Example see ${exampleLink}`)
        // console.log(exampleLink)
        // try {
        //     const newEntry = await prepareNewEntry()
        //     newEntry.secret
        // } catch (_) { }
        return
    }

    if (fs.existsSync(input)) {
        // handle file
        console.log('handle file')
        return
    }

    console.log('is encoded secret',)
}


main()